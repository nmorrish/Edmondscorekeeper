#!/usr/bin/env python3
"""
obs_middleware.py

Workflow per signal:
  0. Ignore any signal whose updateType is not 'judgement' (e.g. a manual
     refresh, or a newly created match) — no capture, no OBS session reset
  1. Extract exchangeDurationMs from signal -> compute keep_secs
  2. Wait POST_BUFFER_MS, then trigger replay buffer saves for all cameras
  3. Wait for a new video file to appear in each camera's output directory
  4. Wait for each file to finish writing
  5. Lossless-trim the last keep_secs with a stream copy (-c copy): no decode,
     no re-encode, no quality loss. The cut snaps to the nearest keyframe.
  6. Hand the trimmed clip to the background upload workers (see below) and
     return immediately — uploads never block the signal loop.
  7. The workers upload to uploadOBSClip.php on the primary server and, if
     configured, on the backup server. Once every worker that needs the files
     is done, and only if the primary upload confirmed, both the trimmed temp
     file and the original OBS source are deleted.
  8. Hard-reset the OBS session: stop buffers, toggle each Source Record filter
     off/on to force a full encoder teardown/rebuild, drop the websocket,
     reconnect, and restart all replay buffers. Replicates a middleware restart
     in-process. On Kepler NVENC a plain replay-buffer stop/start leaves the
     encoder session alive and degraded (records, but choppy); toggling the
     filter's enabled state destroys the encoder object outright so the next
     capture runs on a fresh one.

Uploads are decoupled from capture: trimmed clips are staged on queues and
uploaded by long-lived worker threads. A burst of exchanges in quick succession
is captured and trimmed as fast as OBS allows, then uploaded at whatever rate
the network sustains — the next exchange never waits on the previous one's
upload. The primary (LAN) and backup (WAN) paths have separate queues and
separate workers, so a slow or unreachable backup can never delay a clip
reaching the primary. Neither queue is bounded: if uploads fall behind, the
backlog grows and operators must not let it accumulate.

OBS does all encoding on the GPU (hardware encoder set per Source Record
filter). This script never re-encodes; it only copies the already-encoded
stream into a shorter file. ffmpeg ships inside the Python environment via
imageio-ffmpeg, so there is no separately-installed program to manage.

Set a 1-second keyframe interval on each Source Record filter in OBS so the
keyframe-aligned cut lands within ~1s of target (inside the start buffer).
"""

import json
import logging
import queue
import re
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path

import requests
import obsws_python as obs
import imageio_ffmpeg

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# ================================================================
# Configuration
# ================================================================
RING_NUMBER  = 1
SSE_URL      = "http://192.168.1.2/phpFiles/requestJudgementSSE.php"
UPLOAD_URL   = "http://192.168.1.2/phpFiles/uploadOBSClip.php"
BACKUP_UPLOAD_URL = "https://scorecard.swordsmanship.ca/ec-receiver/uploadOBSClip.php"

# Per-request upload timeouts. The backup is over WAN, so it gets much longer.
UPLOAD_TIMEOUT_S        = 120
BACKUP_UPLOAD_TIMEOUT_S = 600

OBS_HOST     = "192.168.1.4"
OBS_PORT     = 4455
OBS_PASSWORD = "pwd1"

# ffmpeg binary bundled inside the Python environment (no system install).
FFMPEG_PATH  = imageio_ffmpeg.get_ffmpeg_exe()

# Padding around the exchange
PRE_BUFFER_MS  = 5_000   # ms to keep before the exchange started
POST_BUFFER_MS = 5_000   # ms already waited before triggering the save

# If exchangeDurationMs is missing from the signal, fall back to this
FALLBACK_KEEP_SECS = 10.0

FILE_WAIT_TIMEOUT_S = 30
FILE_STABLE_POLL_S  = 0.5
FILE_STABLE_SECS    = 3
MAX_OFFSET_SAMPLES  = 5

# Grace period between dropping the OBS session and reconnecting, so the
# encoder session fully tears down GPU-side before it is rebuilt.
RECYCLE_GAP_S = 1.0

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".flv", ".ts", ".mov"}

# Finished clips are written here, uploaded, then deleted
TEMP_DIR = Path(__file__).parent / "obs_clips_temp"


# ================================================================
# Camera info
# ================================================================
@dataclass
class Camera:
    scene_name: str
    cam_num: int
    output_dir: Path
    filter_name: str = ""


# ================================================================
# Camera detection
# ================================================================
def _resolve_filter_dir(settings: dict, fallback: Path) -> Path | None:
    for key in ("directory", "path", "outputPath", "output_path", "filePath", "file_path"):
        raw = settings.get(key)
        if raw and str(raw).strip():
            p = Path(str(raw).strip())
            if p.is_dir():
                return p
    if fallback.is_dir():
        return fallback
    return None


def detect_cameras(ws_client: obs.ReqClient, obs_record_dir: Path) -> list[Camera]:
    cameras: list[Camera] = []
    cam_num = 1
    dir_usage: dict[Path, list[str]] = {}

    try:
        scene_list = ws_client.get_scene_list()
    except Exception as e:
        log.error(f"Failed to get scene list: {e}")
        return cameras

    for scene in scene_list.scenes:
        scene_name = scene.get("sceneName") or scene.get("name", "")
        if not scene_name:
            continue
        try:
            filter_list = ws_client.get_source_filter_list(name=scene_name)
        except Exception as e:
            log.warning(f"Could not get filters for '{scene_name}': {e}")
            continue

        for f in filter_list.filters:
            if f.get("filterKind") != "source_record_filter":
                continue
            settings = f.get("filterSettings", {})
            if not settings.get("replay_buffer"):
                log.warning(f"  '{scene_name}' not in replay buffer mode — skipping")
                continue

            output_dir = _resolve_filter_dir(settings, obs_record_dir)
            if output_dir is None:
                log.error(
                    f"  '{scene_name}': no output directory found.\n"
                    f"    Set one in the Source Record filter in OBS."
                )
                continue

            filter_name = f.get("filterName", "")
            dir_usage.setdefault(output_dir, []).append(scene_name)
            cameras.append(Camera(scene_name, cam_num, output_dir, filter_name))
            log.info(
                f"  Camera {cam_num}: '{scene_name}' / filter '{filter_name}' → {output_dir}"
            )
            cam_num += 1
            break

    for d, scenes in dir_usage.items():
        if len(scenes) > 1:
            log.warning(
                f"  *** SHARED DIRECTORY: {d}\n"
                f"      Scenes: {scenes}\n"
                f"      Each Source Record filter needs its own unique output path in OBS."
            )

    return cameras


def resolve_cameras(ws_client: obs.ReqClient) -> list[Camera]:
    obs_record_dir = Path("/home/user/Videos")
    try:
        resp = ws_client.get_record_directory()
        candidate = Path(getattr(resp, "record_directory", "") or "")
        if candidate.is_dir():
            obs_record_dir = candidate
    except Exception:
        pass

    log.info("Detecting cameras from OBS Source Record filter settings...")
    cameras = detect_cameras(ws_client, obs_record_dir)

    if not cameras:
        raise RuntimeError("No usable cameras detected — see errors above.")

    missing = [c.scene_name for c in cameras if not c.filter_name]
    if missing:
        log.warning(
            f"  No filter name captured for: {missing} — these cannot be "
            f"toggled during hard reset."
        )

    log.info(f"Ready with {len(cameras)} camera(s).")
    return cameras


# ================================================================
# Clock sync
# ================================================================
_offset_samples: list[float] = []
_offset_lock = threading.Lock()


def update_offset(server_now_ms: int) -> None:
    sample = server_now_ms - _now_ms()
    with _offset_lock:
        _offset_samples.append(sample)
        if len(_offset_samples) > MAX_OFFSET_SAMPLES:
            _offset_samples.pop(0)


def _get_offset() -> float:
    with _offset_lock:
        return sum(_offset_samples) / len(_offset_samples) if _offset_samples else 0.0


def server_to_local_ms(server_ms: int) -> int:
    return server_ms - int(_get_offset())


def _now_ms() -> int:
    return int(time.time() * 1000)


# ================================================================
# OBS session holder — single mutable client shared across threads
# ================================================================
class ObsSession:
    """
    Holds the current OBS client behind a lock. A hard reset swaps the client
    in place so the SSE loop and any later handlers all read the new one.
    """
    def __init__(self, client: obs.ReqClient):
        self.client = client
        self.lock = threading.Lock()

    def reset(self, cameras: list[Camera]) -> None:
        with self.lock:
            self.client = hard_reset(self.client, cameras)


# ================================================================
# OBS replay buffer control
# ================================================================
_obs_lock = threading.Lock()


def start_replay_buffers(ws_client: obs.ReqClient, cameras: list[Camera]) -> None:
    with _obs_lock:
        for cam in cameras:
            try:
                ws_client.call_vendor_request(
                    vendor_name="source-record",
                    request_type="replay_buffer_start",
                    request_data={"source": cam.scene_name},
                )
                log.info(f"  Started replay buffer: '{cam.scene_name}' (cam {cam.cam_num})")
            except Exception as e:
                log.error(f"  Failed to start replay buffer for '{cam.scene_name}': {e}")


def stop_replay_buffers(ws_client: obs.ReqClient, cameras: list[Camera]) -> None:
    with _obs_lock:
        for cam in cameras:
            try:
                ws_client.call_vendor_request(
                    vendor_name="source-record",
                    request_type="replay_buffer_stop",
                    request_data={"source": cam.scene_name},
                )
                log.info(f"  Stopped replay buffer: '{cam.scene_name}' (cam {cam.cam_num})")
            except Exception as e:
                log.error(f"  Failed to stop replay buffer for '{cam.scene_name}': {e}")


def recycle_filters(ws_client: obs.ReqClient, cameras: list[Camera]) -> None:
    """
    Disable then re-enable each Source Record filter to force a full encoder
    teardown/rebuild. A replay-buffer stop/start leaves the encoder session
    alive and degraded on Kepler NVENC; toggling the filter's enabled state
    destroys the encoder object outright and constructs a fresh one.
    """
    with _obs_lock:
        for cam in cameras:
            if not cam.filter_name:
                log.warning(f"  '{cam.scene_name}': no filter name captured, cannot toggle")
                continue
            try:
                ws_client.set_source_filter_enabled(cam.scene_name, cam.filter_name, False)
                ws_client.set_source_filter_enabled(cam.scene_name, cam.filter_name, True)
                log.info(f"  Toggled filter: '{cam.scene_name}' / '{cam.filter_name}'")
            except Exception as e:
                log.error(f"  Failed to toggle filter for '{cam.scene_name}': {e}")


def trigger_replay_saves(ws_client: obs.ReqClient, cameras: list[Camera]) -> None:
    with _obs_lock:
        for cam in cameras:
            try:
                ws_client.call_vendor_request(
                    vendor_name="source-record",
                    request_type="replay_buffer_save",
                    request_data={"source": cam.scene_name},
                )
                log.info(f"  Triggered save: '{cam.scene_name}' (cam {cam.cam_num})")
            except Exception as e:
                log.error(f"  Failed to trigger save for '{cam.scene_name}': {e}")


def hard_reset(ws_client: obs.ReqClient, cameras: list[Camera]) -> obs.ReqClient:
    """
    Replicate a middleware restart without exiting the process: stop all replay
    buffers, toggle each Source Record filter off/on to destroy and rebuild its
    encoder, drop the OBS websocket, reconnect fresh, and restart every buffer.
    Returns the new client. Cameras are reused — scene/filter names don't change
    mid-run, so no re-detection is needed.

    The filter toggle runs on the current (still-live) connection before the
    disconnect: the encoder teardown happens OBS-side and persists across the
    reconnect.
    """
    log.info("Hard reset: rebuilding OBS session and replay buffers...")

    stop_replay_buffers(ws_client, cameras)
    recycle_filters(ws_client, cameras)

    try:
        ws_client.disconnect()
    except Exception as e:
        log.warning(f"  disconnect during reset failed (continuing): {e}")

    time.sleep(RECYCLE_GAP_S)

    new_client = connect_obs()
    start_replay_buffers(new_client, cameras)
    log.info("Hard reset complete.")
    return new_client


# ================================================================
# File detection
# ================================================================
def snapshot_dir(directory: Path) -> set[Path]:
    try:
        return {e.resolve() for e in directory.iterdir()}
    except OSError as e:
        log.error(f"Cannot snapshot {directory}: {e}")
        return set()


def wait_for_new_file(
    cam: Camera,
    not_before: float,
    timeout_s: float,
    pre_snapshot: set[Path],
) -> Path | None:
    seen     = set(pre_snapshot)
    deadline = time.time() + timeout_s

    while time.time() < deadline:
        try:
            for entry in cam.output_dir.iterdir():
                resolved = entry.resolve()
                if resolved in seen:
                    continue
                seen.add(resolved)
                if entry.suffix.lower() not in VIDEO_EXTENSIONS:
                    continue
                try:
                    mtime = entry.stat().st_mtime
                except OSError:
                    continue
                if mtime >= not_before:
                    log.info(f"  cam{cam.cam_num}: found {entry.name}")
                    return entry
        except OSError as e:
            log.error(f"Cannot read {cam.output_dir}: {e}")
        time.sleep(0.25)

    try:
        contents = [e.name for e in cam.output_dir.iterdir() if e.is_file()]
    except OSError:
        contents = ["(unreadable)"]
    log.error(
        f"  cam{cam.cam_num}: timed out waiting in {cam.output_dir}\n"
        f"    Contents: {contents}"
    )
    return None


def wait_for_stable_file(path: Path) -> None:
    """Block until the file size stops changing for FILE_STABLE_SECS seconds."""
    stable_since: float | None = None
    deadline = time.time() + 30
    last_size = -1

    while time.time() < deadline:
        try:
            size = path.stat().st_size
        except OSError:
            time.sleep(FILE_STABLE_POLL_S)
            continue

        if size != last_size:
            last_size    = size
            stable_since = None
        else:
            if stable_since is None:
                stable_since = time.time()
            elif time.time() - stable_since >= FILE_STABLE_SECS:
                log.info(f"  {path.name}: stable at {size // 1024} KB")
                return

        time.sleep(FILE_STABLE_POLL_S)

    log.warning(f"  {path.name}: did not stabilise in time — proceeding anyway")


# ================================================================
# Duration probe (via bundled ffmpeg — no ffprobe needed)
# ================================================================
_DURATION_RE = re.compile(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)")


def probe_duration(path: Path) -> float:
    """
    Return the file duration in seconds by parsing ffmpeg's stderr banner.
    imageio-ffmpeg bundles ffmpeg but not ffprobe, so we read duration from
    ffmpeg itself. Running ffmpeg with no output target prints stream info to
    stderr and exits non-zero — that's expected; we only want the banner.
    """
    try:
        result = subprocess.run(
            [FFMPEG_PATH, "-hide_banner", "-i", str(path)],
            capture_output=True, text=True, timeout=15,
        )
    except (subprocess.TimeoutExpired, OSError) as e:
        log.error(f"  {path.name}: duration probe failed: {e}")
        return 0.0

    m = _DURATION_RE.search(result.stderr)
    if not m:
        log.error(f"  {path.name}: could not parse duration")
        return 0.0

    hours, minutes, seconds = m.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


# ================================================================
# Lossless trim (stream copy — no re-encode, no quality loss)
# ================================================================
def trim_clip(src: Path, dst: Path, keep_secs: float) -> bool:
    """
    Keep the last keep_secs of src, written losslessly to dst via -c copy.

    -c copy copies the already-encoded stream without decoding, so OBS's
    recording quality is preserved exactly and processing is near-instant.
    The cut snaps to the nearest keyframe before the seek point; with a
    1-second keyframe interval set in OBS the result is within ~1s of target,
    which lands inside the pre-exchange buffer.

    Placing -ss before -i performs a fast keyframe-accurate input seek, which
    is what makes a clean stream copy possible regardless of the file's
    absolute timestamps.
    """
    duration = probe_duration(src)
    if duration <= 0:
        log.error(f"  {src.name}: could not determine duration, skipping")
        return False

    # Clamp: if keep_secs exceeds what's in the buffer, keep everything.
    keep_secs = min(keep_secs, duration)
    seek_to   = max(0.0, duration - keep_secs)

    log.info(
        f"  {src.name}: duration={duration:.2f}s "
        f"keep={keep_secs:.2f}s seek={seek_to:.2f}s → {dst.name}"
    )

    cmd = [
        FFMPEG_PATH, "-y",
        "-ss", f"{seek_to:.3f}",
        "-i", str(src),
        "-c", "copy",
        "-movflags", "+faststart",
        str(dst),
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except subprocess.TimeoutExpired:
        log.error(f"  ffmpeg timed out trimming {src.name}")
        return False

    if result.returncode != 0:
        log.error(f"  ffmpeg error (exit {result.returncode}):\n{result.stderr[-800:]}")
        return False

    if not dst.exists() or dst.stat().st_size == 0:
        log.error(f"  ffmpeg produced empty output for {src.name}")
        return False

    log.info(f"  {dst.name}: {dst.stat().st_size // 1024} KB")
    return True


# ================================================================
# Upload — PHP stores the file as-is, no further processing
# ================================================================
def upload_clip(url: str, clip_path: Path, exchange_id: int, camera_number: int,
                timeout_s: int = UPLOAD_TIMEOUT_S) -> bool:
    mime = "video/mp4"
    try:
        with open(clip_path, "rb") as fh:
            resp = requests.post(
                url,
                data={
                    "exchangeId":   exchange_id,
                    "cameraNumber": camera_number,
                    "mimeType":     mime,
                    "trimSecs":     0,        # already trimmed here
                },
                files={"clip": (clip_path.name, fh, mime)},
                timeout=timeout_s,
            )
        if resp.ok:
            log.info(
                f"  Uploaded cam{camera_number} → {url}: {resp.json().get('status')} "
                f"({clip_path.stat().st_size // 1024} KB)"
            )
            return True
        log.error(
            f"  Upload FAILED cam{camera_number} → {url}: "
            f"HTTP {resp.status_code}\n  Body: {resp.text}"
        )
        return False
    except Exception as e:
        log.error(f"  Upload exception cam{camera_number} → {url}: {e}")
        return False


# ================================================================
# Upload queues + background workers
# ================================================================
# Two independent queues, each drained by its own worker thread:
#   _upload_queue  — primary server, LAN, fast
#   _backup_queue  — backup server, WAN, slow
# They do not block each other. A slow or dead backup can build an arbitrary
# backlog without ever delaying a clip reaching the primary.
#
# Each item is (dst, src, exchange_id, cam_num):
#   dst = trimmed temp clip to upload
#   src = original OBS source file
#
# Because both workers read the same two files, deletion is reference-counted.
# A clip is registered with one reference per queue it was placed on; each
# worker releases its reference when done. The last release deletes both files
# — but ONLY if the primary upload succeeded. If the primary failed, both files
# stay on disk for manual recovery regardless of what the backup did.
#
# Neither queue is bounded. If the backup falls behind, staged clips are held on
# disk until it catches up, so disk usage tracks the backup backlog rather than
# the primary's. Watch the depth reported in the per-item log lines.
_upload_queue: "queue.Queue[tuple[Path, Path, int, int]]" = queue.Queue()
_backup_queue: "queue.Queue[tuple[Path, Path, int, int]]" = queue.Queue()

# dst path -> {"count": outstanding refs, "primary_ok": bool}
_refs: dict[Path, dict] = {}
_refs_lock = threading.Lock()


def _register_clip(dst: Path, refs: int) -> None:
    """Record how many workers will read this clip before it can be deleted."""
    with _refs_lock:
        _refs[dst] = {"count": refs, "primary_ok": False}


def _mark_primary_ok(dst: Path) -> None:
    with _refs_lock:
        entry = _refs.get(dst)
        if entry is not None:
            entry["primary_ok"] = True


def _release_clip(dst: Path, src: Path, cam_num: int) -> None:
    """
    Drop one reference. On the last release, delete the trimmed clip and the OBS
    source — but only if the primary upload confirmed. Otherwise both are left
    in place for manual recovery.
    """
    with _refs_lock:
        entry = _refs.get(dst)
        if entry is None:
            return
        entry["count"] -= 1
        if entry["count"] > 0:
            return
        primary_ok = entry["primary_ok"]
        del _refs[dst]

    if not primary_ok:
        log.error(
            f"  cam{cam_num}: primary upload failed, keeping source {src.name} "
            f"and trimmed clip {dst.name}"
        )
        return

    try:
        dst.unlink(missing_ok=True)
    except OSError:
        pass
    try:
        src.unlink(missing_ok=True)
        log.info(f"  cam{cam_num}: deleted source file {src.name}")
    except OSError as e:
        log.warning(f"  cam{cam_num}: could not delete source {src.name}: {e}")


def _run_upload_worker(
    q: "queue.Queue[tuple[Path, Path, int, int]]",
    url: str,
    label: str,
    is_primary: bool,
    timeout_s: int,
) -> None:
    """
    Long-lived consumer for one queue. Every item is wrapped in try/except so a
    single bad upload can never kill the worker and stall all future uploads,
    and the reference is released in a finally block so a crash mid-item can
    never strand files on disk forever.
    """
    while True:
        dst, src, exchange_id, cam_num = q.get()
        try:
            log.info(
                f"  cam{cam_num}: {label} upload of exchange {exchange_id} "
                f"({q.qsize()} more waiting)"
            )
            if upload_clip(url, dst, exchange_id, cam_num, timeout_s):
                if is_primary:
                    _mark_primary_ok(dst)
            elif not is_primary:
                log.warning(
                    f"  cam{cam_num}: BACKUP upload failed for exchange "
                    f"{exchange_id} — backup will be missing this clip"
                )
        except Exception as e:
            log.error(f"  cam{cam_num}: {label} worker error (continuing): {e}")
        finally:
            _release_clip(dst, src, cam_num)
            q.task_done()


# ================================================================
# Signal handler
# ================================================================
def handle_signal(
    signal: dict,
    session: ObsSession,
    cameras: list[Camera],
) -> None:
    exchange_id          = signal.get("exchangeId")
    sent_at              = signal.get("sentAt")
    server_now           = signal.get("serverNow")
    exchange_duration_ms = signal.get("exchangeDurationMs")
    update_type          = signal.get("updateType", "judgement")

    if update_type != "judgement":
        if server_now:
            update_offset(server_now)          # free clock calibration
        log.info(f"Signal type '{update_type}' — no capture, skipping")
        return

    if not exchange_id or not sent_at or not server_now:
        log.warning("Signal missing required fields — skipping")
        return

    # How much of the saved buffer to keep:
    #   PRE_BUFFER_MS  — footage before the exchange started
    #   exchange       — the exchange itself
    #   POST_BUFFER_MS — already captured because we wait before saving
    if exchange_duration_ms is not None:
        keep_secs = (exchange_duration_ms + PRE_BUFFER_MS + POST_BUFFER_MS) / 1000.0
        log.info(
            f"Signal: exchange={exchange_id} "
            f"duration={exchange_duration_ms}ms keep={keep_secs:.2f}s"
        )
    else:
        keep_secs = FALLBACK_KEEP_SECS
        log.warning(
            f"Signal: exchange={exchange_id} "
            f"exchangeDurationMs missing — using fallback {keep_secs}s"
        )

    update_offset(server_now)
    local_press_ms = server_to_local_ms(sent_at)

    wait_ms = max(0, (local_press_ms + POST_BUFFER_MS) - _now_ms())
    if wait_ms > 0:
        log.info(f"  Waiting {wait_ms} ms post-buffer...")
        time.sleep(wait_ms / 1000)

    # Read the current client once for this capture. A reset only happens at the
    # end of this handler, and matches are one-at-a-time, so this stays valid
    # for the whole capture.
    ws_client = session.client

    # Snapshot output directories BEFORE triggering so fast writers aren't missed
    pre_snapshots = {cam.cam_num: snapshot_dir(cam.output_dir) for cam in cameras}
    not_before    = time.time() - 1.0    # 1s grace for clock skew

    trigger_replay_saves(ws_client, cameras)

    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    def process(cam: Camera) -> None:
        src = wait_for_new_file(
            cam, not_before, FILE_WAIT_TIMEOUT_S, pre_snapshots[cam.cam_num]
        )
        if src is None:
            return

        wait_for_stable_file(src)

        dst = TEMP_DIR / f"exchange{exchange_id}-cam{cam.cam_num}.mp4"

        if trim_clip(src, dst, keep_secs):
            # Hand off to the background upload workers and return immediately.
            # src and dst are deleted by whichever worker releases the last
            # reference, and only if the primary upload confirmed.
            _register_clip(dst, 2 if BACKUP_UPLOAD_URL else 1)
            _upload_queue.put((dst, src, exchange_id, cam.cam_num))
            if BACKUP_UPLOAD_URL:
                _backup_queue.put((dst, src, exchange_id, cam.cam_num))
            log.info(f"  cam{cam.cam_num}: trimmed and queued for upload")
        else:
            log.error(f"  cam{cam.cam_num}: trim failed, clip not uploaded")

    # Per-camera threads finish as soon as trimming is done and the clip is
    # queued (local disk + CPU, fast) — they no longer wait on the network.
    threads = [
        threading.Thread(target=process, args=(cam,), daemon=True)
        for cam in cameras
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # All clips captured and queued for upload — rebuild the OBS session so the
    # next capture starts from a fresh encoder, same as a middleware restart.
    # This is gated on trim completion, NOT upload completion: uploads continue
    # in the background workers and do not block this reset. The reset only
    # touches the OBS websocket, which is unrelated to the in-flight HTTP
    # uploads, so recycling here cannot disturb them.
    session.reset(cameras)

    log.info(f"Signal {exchange_id} complete.")


# ================================================================
# SSE listener
# ================================================================
def run_sse(session: ObsSession, cameras: list[Camera]) -> None:
    url = f"{SSE_URL}?ringNumber={RING_NUMBER}"
    retry_delay = 1.0

    while True:
        try:
            log.info(f"Connecting to SSE: {url}")
            with requests.get(url, stream=True, timeout=(10, None)) as resp:
                resp.raise_for_status()
                retry_delay = 1.0
                event_type  = "message"

                for raw_line in resp.iter_lines(decode_unicode=True):
                    if not raw_line:
                        event_type = "message"
                        continue
                    if raw_line.startswith("event:"):
                        event_type = raw_line[6:].strip()
                        continue
                    if not raw_line.startswith("data:"):
                        continue
                    data_str = raw_line[5:].strip()
                    if not data_str:
                        continue
                    try:
                        data = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue

                    if event_type == "heartbeat":
                        sn = data.get("serverNow") if isinstance(data, dict) else None
                        if sn:
                            update_offset(sn)
                        continue

                    if isinstance(data, dict) and "sentAt" in data:
                        threading.Thread(
                            target=handle_signal,
                            args=(data, session, cameras),
                            daemon=True,
                        ).start()

        except Exception as e:
            log.error(f"SSE error: {e}")

        log.info(f"SSE reconnecting in {retry_delay:.0f}s ...")
        time.sleep(retry_delay)
        retry_delay = min(retry_delay * 2, 30)


# ================================================================
# OBS connection
# ================================================================
def connect_obs() -> obs.ReqClient:
    while True:
        try:
            client = obs.ReqClient(host=OBS_HOST, port=OBS_PORT, password=OBS_PASSWORD)
            log.info(f"Connected to OBS at {OBS_HOST}:{OBS_PORT}")
            return client
        except Exception as e:
            log.error(f"OBS connection failed: {e} — retrying in 5s")
            time.sleep(5)


# ================================================================
# Entry point
# ================================================================
def main() -> None:
    log.info(f"OBS Middleware starting — ring {RING_NUMBER}")
    log.info(f"Using bundled ffmpeg: {FFMPEG_PATH}")
    ws_client = connect_obs()
    cameras   = resolve_cameras(ws_client)
    start_replay_buffers(ws_client, cameras)
    session   = ObsSession(ws_client)

    # Start the background upload workers before listening for signals. Each
    # drains its own queue for the life of the process; the slow backup path
    # never delays the primary.
    threading.Thread(
        target=_run_upload_worker,
        args=(_upload_queue, UPLOAD_URL, "primary", True, UPLOAD_TIMEOUT_S),
        daemon=True,
    ).start()
    log.info("Primary upload worker started.")

    if BACKUP_UPLOAD_URL:
        threading.Thread(
            target=_run_upload_worker,
            args=(_backup_queue, BACKUP_UPLOAD_URL, "backup", False, BACKUP_UPLOAD_TIMEOUT_S),
            daemon=True,
        ).start()
        log.info(f"Backup upload worker started → {BACKUP_UPLOAD_URL}")
    else:
        log.info("Backup upload disabled (BACKUP_UPLOAD_URL empty).")

    run_sse(session, cameras)


if __name__ == "__main__":
    main()
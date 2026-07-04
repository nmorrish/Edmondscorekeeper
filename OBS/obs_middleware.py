#!/usr/bin/env python3
"""
obs_middleware.py

Workflow per signal:
  1. Extract exchangeDurationMs from signal -> compute keep_secs
  2. Wait POST_BUFFER_MS, then trigger replay buffer saves for all cameras
  3. Wait for a new video file to appear in each camera's output directory
  4. Wait for each file to finish writing
  5. Lossless-trim the last keep_secs with a stream copy (-c copy): no decode,
     no re-encode, no quality loss. The cut snaps to the nearest keyframe.
  6. Upload the finished clip to uploadOBSClip.php
  7. Delete the local temp file

OBS does all encoding on the GPU (hardware encoder set per Source Record
filter). This script never re-encodes; it only copies the already-encoded
stream into a shorter file. ffmpeg ships inside the Python environment via
imageio-ffmpeg, so there is no separately-installed program to manage.

Set a 1-second keyframe interval on each Source Record filter in OBS so the
keyframe-aligned cut lands within ~1s of target (inside the start buffer).
"""

import json
import logging
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

OBS_HOST     = "192.168.1.3"
OBS_PORT     = 4455
OBS_PASSWORD = "T54Gi6XzLAqYNkJJ"

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
            if settings.get("record_mode") != 3:
                log.warning(f"  '{scene_name}' not in replay buffer mode — skipping")
                continue

            output_dir = _resolve_filter_dir(settings, obs_record_dir)
            if output_dir is None:
                log.error(
                    f"  '{scene_name}': no output directory found.\n"
                    f"    Set one in the Source Record filter in OBS."
                )
                continue

            dir_usage.setdefault(output_dir, []).append(scene_name)
            cameras.append(Camera(scene_name, cam_num, output_dir))
            log.info(f"  Camera {cam_num}: '{scene_name}' → {output_dir}")
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
def upload_clip(clip_path: Path, exchange_id: int, camera_number: int) -> bool:
    mime = "video/mp4"
    try:
        with open(clip_path, "rb") as fh:
            resp = requests.post(
                UPLOAD_URL,
                data={
                    "exchangeId":   exchange_id,
                    "cameraNumber": camera_number,
                    "mimeType":     mime,
                    "trimSecs":     0,        # already trimmed here
                },
                files={"clip": (clip_path.name, fh, mime)},
                timeout=120,
            )
        if resp.ok:
            log.info(
                f"  Uploaded cam{camera_number}: {resp.json().get('status')} "
                f"({clip_path.stat().st_size // 1024} KB)"
            )
            return True
        log.error(
            f"  Upload FAILED cam{camera_number}: "
            f"HTTP {resp.status_code}\n  Body: {resp.text}"
        )
        return False
    except Exception as e:
        log.error(f"  Upload exception cam{camera_number}: {e}")
        return False


# ================================================================
# Signal handler
# ================================================================
def handle_signal(
    signal: dict,
    ws_client: obs.ReqClient,
    cameras: list[Camera],
) -> None:
    exchange_id          = signal.get("exchangeId")
    sent_at              = signal.get("sentAt")
    server_now           = signal.get("serverNow")
    exchange_duration_ms = signal.get("exchangeDurationMs")

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
            if upload_clip(dst, exchange_id, cam.cam_num):
                try:
                    src.unlink(missing_ok=True)
                    log.info(f"  cam{cam.cam_num}: deleted source file {src.name}")
                except OSError as e:
                    log.warning(f"  cam{cam.cam_num}: could not delete source {src.name}: {e}")
            else:
                log.error(f"  cam{cam.cam_num}: upload failed, keeping source {src.name}")
        else:
            log.error(f"  cam{cam.cam_num}: trim failed, clip not uploaded")

        try:
            dst.unlink(missing_ok=True)
        except OSError:
            pass

    threads = [
        threading.Thread(target=process, args=(cam,), daemon=True)
        for cam in cameras
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    log.info(f"Signal {exchange_id} complete.")


# ================================================================
# SSE listener
# ================================================================
def run_sse(ws_client: obs.ReqClient, cameras: list[Camera]) -> None:
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
                            args=(data, ws_client, cameras),
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
    run_sse(ws_client, cameras)


if __name__ == "__main__":
    main()
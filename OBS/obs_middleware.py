#!/usr/bin/env python3
"""
obs_middleware.py

Workflow per signal:
  1. Extract exchangeDurationMs from signal → compute keep_secs
  2. Wait POST_BUFFER_MS, then trigger replay buffer saves for all cameras
  3. Wait for a new video file to appear in each camera's output directory
  4. Wait for each file to finish writing
  5. Re-encode with ffmpeg: probe absolute start_time, seek correctly,
     output a clean clip of exactly keep_secs duration
  6. Upload the finished clip to uploadOBSClip.php (trimSecs=0 — PHP just stores it)
  7. Delete the local temp file

Re-encoding (vs stream copy) is required because OBS replay buffer MP4 files
carry absolute wall-clock timestamps. Stream copy from a mis-seeked position
writes bytes from the wrong file offset, producing corrupted H.264 NAL units.
Re-encoding decodes first so the output is always clean.
"""

import json
import logging
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path

import requests
import obsws_python as obs

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# ================================================================
# Configuration
# ================================================================
RING_NUMBER  = 1
SSE_URL      = "http://localhost/Edmondscorekeeper/phpFiles/requestJudgementSSE.php"
UPLOAD_URL   = "http://localhost/Edmondscorekeeper/phpFiles/uploadOBSClip.php"

OBS_HOST     = "10.0.0.187"
OBS_PORT     = 4455
OBS_PASSWORD = "T54Gi6XzLAqYNkJJ"

FFMPEG_PATH  = "ffmpeg"
FFPROBE_PATH = "ffprobe"

# Padding around the exchange
PRE_BUFFER_MS  = 5_000   # ms to keep before the exchange started
POST_BUFFER_MS = 5_000     # ms already waited before triggering the save

# If exchangeDurationMs is missing from the signal, fall back to this
FALLBACK_KEEP_SECS = 10.0

FILE_WAIT_TIMEOUT_S = 30
FILE_STABLE_POLL_S  = 0.5
FILE_STABLE_SECS    = 3
MAX_OFFSET_SAMPLES  = 5

# Re-encode settings — ultrafast keeps processing time under ~1s for short clips
VIDEO_CODEC   = "libx264"
VIDEO_PRESET  = "medium"
VIDEO_CRF     = "23"
AUDIO_CODEC   = "aac"

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
    obs_record_dir = Path("/home/nick-ua01/Videos")
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
# FFmpeg: probe then re-encode
# ================================================================
def probe_file(path: Path) -> tuple[float, float]:
    """
    Return (start_time, duration) in seconds.
    OBS replay buffer files typically have large absolute start_time values
    (wall-clock seconds since OBS launched) rather than 0.
    """
    try:
        result = subprocess.run(
            [
                FFPROBE_PATH, "-v", "error",
                "-show_entries", "format=start_time,duration",
                "-of", "csv=p=0",
                str(path),
            ],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode == 0:
            parts = result.stdout.strip().split(",")
            start    = float(parts[0]) if parts[0] not in ("", "N/A") else 0.0
            duration = float(parts[1]) if len(parts) > 1 and parts[1] not in ("", "N/A") else 0.0
            return start, duration
    except (subprocess.TimeoutExpired, ValueError, IndexError, OSError):
        pass
    return 0.0, 0.0


def reencode_clip(src: Path, dst: Path, keep_secs: float) -> bool:
    """
    Re-encode the last keep_secs of src into dst.

    Why re-encode instead of stream copy:
      OBS replay buffer files have absolute wall-clock timestamps. Seeking
      with -sseof computes the wrong target position, and -c copy then writes
      bytes from the wrong offset in the source file — producing corrupted
      H.264 NAL units. Re-encoding decodes first, so the output is always
      clean regardless of where the seek lands.

    Why probe start_time:
      -sseof and -ss both operate on the file's internal timestamp scale.
      If start_time is 5400s, seeking to "60s before the end" requires
      seeking to 5400 + (duration - keep_secs), not just (duration - keep_secs).
    """
    start_time, duration = probe_file(src)

    if duration <= 0:
        log.error(f"  {src.name}: could not determine duration, skipping")
        return False

    # Clamp: if keep_secs exceeds what's in the buffer, keep everything
    keep_secs  = min(keep_secs, duration)
    seek_to    = start_time + max(0.0, duration - keep_secs)

    log.info(
        f"  {src.name}: duration={duration:.2f}s start={start_time:.1f}s "
        f"keep={keep_secs:.2f}s seek={seek_to:.2f}s → {dst.name}"
    )

    cmd = [
        FFMPEG_PATH, "-y",
        "-ss", f"{seek_to:.3f}",
        "-i", str(src),
        "-c:v", VIDEO_CODEC,
        "-preset", VIDEO_PRESET,
        "-crf", VIDEO_CRF,
        "-c:a", AUDIO_CODEC,
        "-movflags", "+faststart",
        str(dst),
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        log.error(f"  FFmpeg timed out encoding {src.name}")
        return False

    if result.returncode != 0:
        log.error(f"  FFmpeg error (exit {result.returncode}):\n{result.stderr[-800:]}")
        return False

    if not dst.exists() or dst.stat().st_size == 0:
        log.error(f"  FFmpeg produced empty output for {src.name}")
        return False

    log.info(f"  {dst.name}: {dst.stat().st_size // 1024} KB")
    return True


# ================================================================
# Upload — PHP stores the file as-is, no further processing
# ================================================================
def upload_clip(
    clip_path: Path,
    exchange_id: int,
    camera_number: int,
) -> bool:
    mime = "video/mp4"
    try:
        with open(clip_path, "rb") as fh:
            resp = requests.post(
                UPLOAD_URL,
                data={
                    "exchangeId":   exchange_id,
                    "cameraNumber": camera_number,
                    "mimeType":     mime,
                    "trimSecs":     0,        # already trimmed and encoded here
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

    # Calculate how much of the replay buffer to keep:
    #   PRE_BUFFER_MS  — footage before the exchange started
    #   exchange       — the exchange itself
    #   POST_BUFFER_MS — already captured because we wait before saving
    if exchange_duration_ms is not None:
        keep_secs = (exchange_duration_ms + PRE_BUFFER_MS + POST_BUFFER_MS) / 1000.0
        log.info(
            f"Signal: exchange={exchange_id} "
            f"duration={exchange_duration_ms}ms "
            f"keep={keep_secs:.2f}s"
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

    TEMP_DIR.mkdir(exist_ok=True)

    def process(cam: Camera) -> None:
        src = wait_for_new_file(
            cam, not_before, FILE_WAIT_TIMEOUT_S, pre_snapshots[cam.cam_num]
        )
        if src is None:
            return

        wait_for_stable_file(src)

        dst = TEMP_DIR / f"exchange{exchange_id}-cam{cam.cam_num}.mp4"

        if reencode_clip(src, dst, keep_secs):
            upload_clip(dst, exchange_id, cam.cam_num)
        else:
            log.error(f"  cam{cam.cam_num}: encoding failed, clip not uploaded")

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
    ws_client = connect_obs()
    cameras   = resolve_cameras(ws_client)
    start_replay_buffers(ws_client, cameras)
    run_sse(ws_client, cameras)


if __name__ == "__main__":
    main()
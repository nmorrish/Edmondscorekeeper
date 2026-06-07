/**
 * src/components/Judgement/EyeOfJudgement.tsx
 *
 * == Eye of Judgement ==
 * Replay-camera component for dedicated recorder phones. One instance per
 * physical camera; each is identified by a ringNumber + cameraNumber pair
 * from the URL (e.g. /eye-of-judgement/1/2 = ring 1, camera 2).
 *
 * On a judgement signal the component waits until POST_PADDING_MS has elapsed
 * past the button-press, snapshots the rolling buffer (keeping a coarse window
 * of trimSecs + BUFFER_PAD_MS), then uploads the blob with a `trimSecs` field.
 * The server calls FFmpeg with -sseof to discard the front, keeping exactly the
 * last trimSecs seconds (PRE_PADDING + exchange duration + POST_PADDING).
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  backend_uri,
  sse_send_to_to_judge_api,
} from "../../utility/endpoints";
import { apiQuery } from "../../utility/apiClient";

// ===================== Tunables =====================
const MAX_EXCHANGE_MS      = 70_000;
const PRE_PADDING_MS       = 5_000;
const POST_PADDING_MS      = 4_000;
const BUFFER_PAD_MS        = 8_000;   // extra safety margin uploaded beyond trimSecs
const FALLBACK_EXCHANGE_MS = 60_000;

const TIMESLICE_MS     = 500;
const TARGET_WIDTH     = 1920;
const TARGET_HEIGHT    = 1080;
const TARGET_FRAME_RATE = 60;
const TARGET_BITRATE   = 6_000_000;
const MAX_OFFSET_SAMPLES = 5;
const HEARTBEAT_STALE_MS = 15_000;

const TOTAL_BUFFER_MS =
  MAX_EXCHANGE_MS + PRE_PADDING_MS + POST_PADDING_MS + BUFFER_PAD_MS;

const UPLOAD_PATH = "uploadJudgementClip.php";


// ===================== MIME probing =====================
const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1",
  "video/mp4",
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {}
  }
  return null;
}

function extFromMime(mime: string): string {
  if (mime.startsWith("video/mp4")) return "mp4";
  return "webm";
}

// ===================== Types =====================
interface BufferedChunk {
  data: Blob;
  receivedAt: number;
}

interface JudgementSignal {
  matchId: number;
  matchRing: number;
  sentAt: number;
  serverNow: number;
  exchangeDurationMs?: number;
  exchangeId?: number | null;
  lastJudgement?: string;
}

interface ClipUploadRecord {
  matchId: number;
  pressTime: number;
  sizeBytes: number;
  status: "uploading" | "ok" | "error";
  errorMessage?: string;
  filename: string;
  attemptedAt: number;
}

// ===================== Styling =====================
const wrapperStyle: React.CSSProperties = {
  fontFamily: "sans-serif",
  padding: "16px",
  maxWidth: "640px",
  margin: "0 auto",
};

const buttonStyle: React.CSSProperties = {
  padding: "12px 20px",
  fontSize: "1rem",
  margin: "8px 4px",
  borderRadius: "6px",
  border: "1px solid #888",
  background: "#222",
  color: "#eee",
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#7a1a1a",
};

const recBadgeStyle = (recording: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "6px 14px",
  borderRadius: "999px",
  background: recording ? "#b30000" : "#444",
  color: "#fff",
  fontWeight: 700,
  letterSpacing: "0.15em",
  fontSize: "0.95rem",
  textTransform: "uppercase",
});

const camBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 14px",
  borderRadius: "6px",
  background: "#1a3d6e",
  color: "#fff",
  fontWeight: 800,
  letterSpacing: "0.15em",
  fontSize: "1rem",
  textTransform: "uppercase",
};

const dotStyle: React.CSSProperties = {
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  background: "#fff",
  animation: "eoj-pulse 1.2s ease-in-out infinite",
};

const videoStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "640px",
  background: "#000",
  borderRadius: "8px",
  marginTop: "12px",
};

// ===================== Component =====================
const EyeOfJudgement: React.FC = () => {
  const params = useParams<{ ringNumber?: string; cameraNumber?: string }>();
  const ringNumber   = params.ringNumber   ? parseInt(params.ringNumber,   10) : null;
  const cameraNumber = params.cameraNumber ? parseInt(params.cameraNumber, 10) : null;

  const [recording,         setRecording]         = useState(false);
  const [errorMsg,          setErrorMsg]           = useState<string | null>(null);
  const [mimeType,          setMimeType]           = useState<string | null>(null);
  const [lastHeartbeat,     setLastHeartbeat]      = useState<number>(Date.now());
  const [connectionStatus,  setConnectionStatus]   = useState<"ok" | "warn">("warn");
  const [_,           setUploads]            = useState<ClipUploadRecord[]>([]);

  const videoRef      = useRef<HTMLVideoElement | null>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const recorderRef   = useRef<MediaRecorder | null>(null);
  const initChunkRef  = useRef<Blob | null>(null);
  const chunksRef     = useRef<BufferedChunk[]>([]);
  const offsetSamplesRef = useRef<number[]>([]);
  const offsetRef     = useRef<number>(0);
  const wakeLockRef   = useRef<WakeLockSentinel | null>(null);
  const esRef         = useRef<EventSource | null>(null);
  const restartingRef = useRef(false);

  const navigate = useNavigate();
  const [availableRings, setAvailableRings] = useState<number[]>([]);
  const [setupStep, setSetupStep] = useState<"ring" | "camera" | null>(
    !ringNumber || !cameraNumber || cameraNumber <= 0 ? "ring" : null
  );
  const [pendingRing, setPendingRing] = useState<number | null>(null);

  useEffect(() => {
    if (setupStep === null) return;
    apiQuery(`${backend_uri}/eventApi.php?ringsOnly=1`)
      .then((r) => r.json())
      .then((data) => {
        if (data.status === "success" && data.maxRings > 0) {
          setAvailableRings(Array.from({ length: data.maxRings }, (_, i) => i + 1));
        } else {
          setAvailableRings([1]);
        }
      })
      .catch(() => setAvailableRings([1]));
  }, [setupStep]);

  if (setupStep === "ring") {
    return (
      <div style={wrapperStyle}>
        <h1>Eye of Judgement</h1>
        <p>Select your ring:</p>
        {availableRings.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Loading rings…</p>
        ) : (
          availableRings.map((r) => (
            <button
              key={r}
              style={buttonStyle}
              onClick={() => { setPendingRing(r); setSetupStep("camera"); }}
            >
              Ring {r}
            </button>
          ))
        )}
      </div>
    );
  }

  if (setupStep === "camera") {
    return (
      <div style={wrapperStyle}>
        <h1>Eye of Judgement</h1>
        <p>Ring {pendingRing} — Select your camera:</p>
        {Array.from({ length: 8 }, (_, i) => i + 1).map((c) => (
          <button
            key={c}
            style={buttonStyle}
            onClick={() => navigate(`/eye-of-judgement/${pendingRing}/${c}`)}
          >
            Camera {c}
          </button>
        ))}
        <br />
        <button style={{ ...buttonStyle, marginTop: "8px" }} onClick={() => setSetupStep("ring")}>
          ← Back
        </button>
      </div>
    );
  }

  const updateOffset = useCallback((serverNow: number) => {
    const sample = serverNow - Date.now();
    offsetSamplesRef.current.push(sample);
    if (offsetSamplesRef.current.length > MAX_OFFSET_SAMPLES) {
      offsetSamplesRef.current.shift();
    }
    const sum = offsetSamplesRef.current.reduce((a, b) => a + b, 0);
    offsetRef.current = sum / offsetSamplesRef.current.length;
  }, []);

  const serverToLocal = useCallback(
    (serverMs: number) => serverMs - offsetRef.current,
    []
  );

  const handleDataAvailable = useCallback((e: BlobEvent) => {
    if (!e.data || e.data.size === 0) return;
    if (!initChunkRef.current) initChunkRef.current = e.data;
    chunksRef.current.push({ data: e.data, receivedAt: Date.now() });

    // Trim chunks older than TOTAL_BUFFER_MS, but never evict the init chunk
    // (it holds the container headers needed to decode any later slice).
    const cutoff = Date.now() - TOTAL_BUFFER_MS;
    while (
      chunksRef.current.length > 0 &&
      chunksRef.current[0].receivedAt < cutoff &&
      chunksRef.current[0].data !== initChunkRef.current
    ) {
      chunksRef.current.shift();
    }
  }, []);

  const startRecording = useCallback(async () => {
    setErrorMsg(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          window.isSecureContext
            ? "Camera API unavailable on this browser."
            : "Camera requires HTTPS. This page is served over plain HTTP."
        );
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width:     { ideal: TARGET_WIDTH },
          height:    { ideal: TARGET_HEIGHT },
          frameRate: { ideal: TARGET_FRAME_RATE, max: TARGET_FRAME_RATE },
        },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const chosenMime = pickMimeType();
      if (!chosenMime) throw new Error("No supported video MIME type found on this device.");
      setMimeType(chosenMime);

      const recorder = new MediaRecorder(stream, {
        mimeType: chosenMime,
        videoBitsPerSecond: TARGET_BITRATE,
      });
      recorder.ondataavailable = handleDataAvailable;
      recorder.onerror = (ev) => {
        console.error("MediaRecorder error:", ev);
        setErrorMsg("Recorder error — attempting restart");
        scheduleRestart();
      };
      recorder.onstop = () => {
        if (recording && !restartingRef.current) {
          console.warn("Recorder stopped unexpectedly; restarting");
          scheduleRestart();
        }
      };

      initChunkRef.current = null;
      chunksRef.current    = [];
      recorder.start(TIMESLICE_MS);
      recorderRef.current = recorder;
      setRecording(true);
    } catch (err: any) {
      console.error("Failed to start recording:", err);
      setErrorMsg(err?.message || "Failed to access camera.");
      setRecording(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleDataAvailable]);

  const stopRecording = useCallback(() => {
    try { recorderRef.current?.stop(); } catch {}
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    initChunkRef.current = null;
    chunksRef.current    = [];
    setRecording(false);
  }, []);

  const scheduleRestart = useCallback(() => {
    if (restartingRef.current) return;
    restartingRef.current = true;
    setTimeout(async () => {
      stopRecording();
      await startRecording();
      restartingRef.current = false;
    }, 500);
  }, [startRecording, stopRecording]);

  const acquireWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      const sentinel = await (navigator as any).wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      sentinel.addEventListener("release", () => {
        if (document.visibilityState === "visible") acquireWakeLock();
      });
    } catch (err) {
      console.warn("Wake lock failed:", err);
    }
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [acquireWakeLock]);

  // ---- Upload ----
  // Sends the blob plus trimSecs so the server knows how much to keep from
  // the end via FFmpeg. The client does no timecode manipulation.
  const uploadClip = useCallback(
    async (blob: Blob, signal: JudgementSignal, trimSecs: number) => {
      const ext      = extFromMime(blob.type);
      const filename = `match-${signal.matchId}-${signal.sentAt}-ring${signal.matchRing}.${ext}`;

      const record: ClipUploadRecord = {
        matchId:     signal.matchId,
        pressTime:   signal.sentAt,
        sizeBytes:   blob.size,
        status:      "uploading",
        filename,
        attemptedAt: Date.now(),
      };
      setUploads((prev) => [record, ...prev].slice(0, 10));

      const fd = new FormData();
      fd.append("clip",          blob, filename);
      fd.append("matchId",       String(signal.matchId));
      fd.append("ringNumber",    String(signal.matchRing));
      fd.append("cameraNumber",  String(cameraNumber));
      fd.append("pressTime",     String(signal.sentAt));
      fd.append("mimeType",      blob.type);
      fd.append("trimSecs",      trimSecs.toFixed(3));
      if (signal.exchangeId) {
        fd.append("exchangeId", String(signal.exchangeId));
      }

      try {
        const resp = await apiQuery(`${backend_uri}/${UPLOAD_PATH}`, {
          method: "POST",
          body:   fd,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        setUploads((prev) =>
          prev.map((u) => (u.filename === filename ? { ...u, status: "ok" } : u))
        );
        scheduleRestart();
      } catch (err: any) {
        console.error("Upload failed:", err);
        setUploads((prev) =>
          prev.map((u) =>
            u.filename === filename
              ? { ...u, status: "error", errorMessage: err?.message || "upload failed" }
              : u
          )
        );
      }
    },
    [cameraNumber, scheduleRestart]
  );

  // ---- Signal handler ----
  // Waits until POST_PADDING_MS has elapsed past the judge's press, then
  // snapshots the buffer. We upload a coarse window (trimSecs + BUFFER_PAD_MS)
  // and let the server trim precisely with FFmpeg.
  const handleJudgementSignal = useCallback(
    (signal: JudgementSignal) => {
      if (!initChunkRef.current) {
        console.warn("Judgement signal arrived before recorder ready");
        return;
      }
      updateOffset(signal.serverNow);

      const durationMs =
        typeof signal.exchangeDurationMs === "number" && signal.exchangeDurationMs > 0
          ? signal.exchangeDurationMs
          : FALLBACK_EXCHANGE_MS;

      // trimSecs = exactly what FFmpeg should keep from the end of the upload.
      const trimSecs = (PRE_PADDING_MS + durationMs + POST_PADDING_MS) / 1000;

      // Wait until the post-padding window has fully elapsed before we snapshot.
      const localStopTime = serverToLocal(signal.sentAt);
      const delay = Math.max(0, (localStopTime + POST_PADDING_MS) - Date.now()) + 100;

      setTimeout(() => {
        const init = initChunkRef.current;
        if (!init) {
          console.error("[EoJ] Init chunk gone by upload time for signal", signal);
          return;
        }

        // Coarse capture: a bit more than trimSecs so FFmpeg always has room
        // to seek to the correct keyframe before the target start point.
        const captureWindowMs = trimSecs * 1000 + BUFFER_PAD_MS;
        const captureStart    = Date.now() - captureWindowMs;

        // The init chunk (container headers) is always included regardless of
        // age — without it the blob is undecodable.
        const parts = chunksRef.current
          .filter((c) => c.receivedAt >= captureStart || c.data === init)
          .map((c) => c.data);

        if (parts.length === 0) {
          console.error("[EoJ] No buffered footage for signal", signal);
          setUploads((prev) =>
            [
              {
                matchId:      signal.matchId,
                pressTime:    signal.sentAt,
                sizeBytes:    0,
                status:       "error" as const,
                errorMessage: "No buffered footage at upload time.",
                filename:     `match-${signal.matchId}-${signal.sentAt}-NOSLICE`,
                attemptedAt:  Date.now(),
              },
              ...prev,
            ].slice(0, 10)
          );
          return;
        }

        const blob = new Blob(parts, { type: init.type });
        console.debug(
          `[EoJ] Uploading ${(blob.size / 1024).toFixed(0)} KB ` +
          `(${parts.length} chunks, trimSecs=${trimSecs.toFixed(1)})`
        );
        uploadClip(blob, signal, trimSecs);
      }, delay);
    },
    [serverToLocal, updateOffset, uploadClip]
  );

  const connectToSSE = useCallback(
    (retry = 0) => {
      if (!ringNumber) return null;
      const url = `${backend_uri}/${sse_send_to_to_judge_api}?ringNumber=${ringNumber}`;
      const es  = new EventSource(url);
      esRef.current = es;

      es.onmessage = (event) => {
        if (!event.data) return;
        try {
          const data = JSON.parse(event.data);
          if (data && typeof data.sentAt === "number") {
            handleJudgementSignal(data as JudgementSignal);
          }
        } catch (err) {
          console.error("SSE parse error:", err);
        }
      };

      es.addEventListener("heartbeat", (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (typeof data.serverNow === "number") updateOffset(data.serverNow);
        } catch {}
        setLastHeartbeat(Date.now());
        setConnectionStatus("ok");
      });

      es.onopen = () => {
        setLastHeartbeat(Date.now());
        setConnectionStatus("ok");
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        setConnectionStatus("warn");
        const delay =
          Math.min(30_000, 1_000 * Math.pow(2, retry)) + Math.random() * 500;
        setTimeout(() => connectToSSE(retry + 1), delay);
      };

      return es;
    },
    [ringNumber, handleJudgementSignal, updateOffset]
  );

  useEffect(() => {
    const es = connectToSSE(0);
    return () => {
      es?.close();
      esRef.current?.close();
    };
  }, [connectToSSE]);

  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - lastHeartbeat > HEARTBEAT_STALE_MS) {
        setConnectionStatus("warn");
      }
    }, 5_000);
    return () => clearInterval(id);
  }, [lastHeartbeat]);

  useEffect(() => {
    acquireWakeLock();
    return () => {
      try { wakeLockRef.current?.release(); } catch {}
      wakeLockRef.current = null;
    };
  }, [acquireWakeLock]);

  useEffect(() => {
    return () => {
      try { recorderRef.current?.stop(); } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (!ringNumber || !cameraNumber || cameraNumber <= 0) {
    return (
      <div style={wrapperStyle}>
        <h1>Eye of Judgement</h1>
        <p>
          Missing or invalid URL parameters. Navigate to{" "}
          <code>/eye-of-judgement/&lt;ring&gt;/&lt;camera&gt;</code>{" "}
          — e.g. <code>/eye-of-judgement/1/2</code> for ring 1, camera 2.
        </p>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <style>{`@keyframes eoj-pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } 100% { opacity: 1; transform: scale(1); } }`}</style>

      <h1 style={{ marginBottom: "4px" }}>Eye of Judgement</h1>
      <div style={{ fontSize: "0.9rem", opacity: 0.7, marginBottom: "12px" }}>
        Ring {ringNumber} · Camera {cameraNumber} · clip = {PRE_PADDING_MS / 1000}s pre + {POST_PADDING_MS / 1000}s post
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <span style={camBadgeStyle}>CAM {cameraNumber}</span>
        <span style={recBadgeStyle(recording)}>
          {recording && <span style={dotStyle} />}
          {recording ? "REC" : "STANDBY"}
        </span>
        <span style={{ fontSize: "1.2rem" }}>
          {connectionStatus === "ok" ? "✅ SSE" : "⚠️ SSE"}
        </span>
        {mimeType && <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>{mimeType}</span>}
      </div>

      <video ref={videoRef} autoPlay playsInline muted style={videoStyle} />

      <div style={{ marginTop: "12px" }}>
        {!recording ? (
          <button style={buttonStyle} onClick={startRecording}>Start Camera</button>
        ) : (
          <button style={dangerButtonStyle} onClick={stopRecording}>Stop Camera</button>
        )}
      </div>

      {errorMsg && (
        <div style={{ marginTop: "10px", color: "#ff6b6b" }}>{errorMsg}</div>
      )}

    </div>
  );
};

export default EyeOfJudgement;
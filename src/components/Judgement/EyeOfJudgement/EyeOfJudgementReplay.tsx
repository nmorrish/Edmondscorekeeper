/**
 * src/components/Judgement/EyeOfJudgement.tsx
 *
 * == Eye of Judgement ==
 * Replay-camera component for dedicated recorder phones. One instance per
 * physical camera; each is identified by a ringNumber + cameraNumber pair
 * from the URL (e.g. /eye-of-judgement/1/2 = ring 1, camera 2).
 *
 * Behaviour:
 *  - Continuously records video into a rolling chunk buffer (default ~68s).
 *  - Listens to requestJudgementSSE.php (same stream JudgementManager uses).
 *  - On a judgement signal, computes a slice window of
 *      [pressTime - PRE_BUFFER_MS, pressTime + POST_BUFFER_MS]
 *    in local-clock time, using the serverNow/sentAt fields to keep
 *    server↔phone clocks aligned.
 *  - Slices the buffer, prepends the init chunk, uploads to the server
 *    along with its cameraNumber so the server can route it into the
 *    appropriate cam-N/ subfolder.
 *  - Replay handling is intentionally NOT part of this component — it's
 *    a separate page that listens for "clip ready" events.
 *
 * Design notes:
 *  - The first chunk from MediaRecorder contains codec init data (EBML
 *    for WebM, moov for fragmented MP4). Without it prepended, no slice
 *    is playable. We pin it permanently and never trim it.
 *  - Server clock offset is averaged over a small window of samples
 *    drawn from heartbeats AND from the judgement signal itself.
 *  - Wake Lock is requested on mount and re-acquired on visibility
 *    changes to keep the screen alive across a multi-hour tournament.
 *  - MediaRecorder errors trigger an automatic restart attempt.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  backend_uri,
  sse_send_to_to_judge_api,
} from "../../utility/endpoints";
import { apiQuery } from "../../utility/apiClient";

// ===================== Tunables =====================
const PRE_BUFFER_MS = 60_000;
const POST_BUFFER_MS = 500;
const BUFFER_PAD_MS = 8_000;
const TIMESLICE_MS = 500;
const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1080;
const TARGET_FRAME_RATE = 60;
const TARGET_BITRATE = 6_000_000;
const MAX_OFFSET_SAMPLES = 5;
const HEARTBEAT_STALE_MS = 15_000;

const TOTAL_BUFFER_MS = PRE_BUFFER_MS + BUFFER_PAD_MS + POST_BUFFER_MS;

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
  const ringNumber = params.ringNumber ? parseInt(params.ringNumber, 10) : null;
  const cameraNumber = params.cameraNumber ? parseInt(params.cameraNumber, 10) : null;

  // --- recording state ---
  const [recording, setRecording] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);

  // --- SSE state ---
  const [lastHeartbeat, setLastHeartbeat] = useState<number>(Date.now());
  const [connectionStatus, setConnectionStatus] =
    useState<"ok" | "warn">("warn");

  // --- upload log (most recent first) ---
  const [uploads, setUploads] = useState<ClipUploadRecord[]>([]);

  // --- refs ---
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const initChunkRef = useRef<Blob | null>(null);
  const chunksRef = useRef<BufferedChunk[]>([]);
  const offsetSamplesRef = useRef<number[]>([]);
  const offsetRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const restartingRef = useRef(false);

  // ===================== Clock offset =====================
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

  // ===================== Buffer handling =====================
  const handleDataAvailable = useCallback((e: BlobEvent) => {
    if (!e.data || e.data.size === 0) return;

    if (!initChunkRef.current) {
      initChunkRef.current = e.data;
    }

    chunksRef.current.push({ data: e.data, receivedAt: Date.now() });

    const cutoff = Date.now() - TOTAL_BUFFER_MS;
    while (
      chunksRef.current.length > 0 &&
      chunksRef.current[0].receivedAt < cutoff &&
      chunksRef.current[0].data !== initChunkRef.current
    ) {
      chunksRef.current.shift();
    }
  }, []);

  const sliceBuffer = useCallback(
    (windowStartMs: number, windowEndMs: number): Blob | null => {
      const init = initChunkRef.current;
      if (!init) return null;

      const overlap = chunksRef.current.filter((c) => {
        const chunkEnd = c.receivedAt;
        const chunkStart = c.receivedAt - TIMESLICE_MS;
        return chunkEnd >= windowStartMs && chunkStart <= windowEndMs;
      });

      if (overlap.length === 0) return null;

      const parts: Blob[] = [];
      if (overlap[0].data !== init) {
        parts.push(init);
      }
      for (const c of overlap) parts.push(c.data);

      return new Blob(parts, { type: init.type });
    },
    []
  );

  // ===================== Recorder lifecycle =====================
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
          width: { ideal: TARGET_WIDTH },
          height: { ideal: TARGET_HEIGHT },
          frameRate: { ideal: TARGET_FRAME_RATE, max: TARGET_FRAME_RATE },
        },
        audio: true,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const chosenMime = pickMimeType();
      if (!chosenMime) {
        throw new Error("No supported video MIME type found on this device.");
      }
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
      chunksRef.current = [];

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
    try {
      recorderRef.current?.stop();
    } catch {}
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    initChunkRef.current = null;
    chunksRef.current = [];
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

  // ===================== Wake Lock =====================
  const acquireWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      const sentinel = await (navigator as any).wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      sentinel.addEventListener("release", () => {
        if (document.visibilityState === "visible") {
          acquireWakeLock();
        }
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

  // ===================== Upload =====================
  const uploadClip = useCallback(
    async (blob: Blob, signal: JudgementSignal) => {
      
      const ext = extFromMime(blob.type);
      const filename = `match-${signal.matchId}-${signal.sentAt}-ring${signal.matchRing}.${ext}`;

      const record: ClipUploadRecord = {
        matchId: signal.matchId,
        pressTime: signal.sentAt,
        sizeBytes: blob.size,
        status: "uploading",
        filename,
        attemptedAt: Date.now(),
      };
      setUploads((prev) => [record, ...prev].slice(0, 10));

      const fd = new FormData();
      fd.append("clip", blob, filename);
      fd.append("matchId", String(signal.matchId));
      fd.append("ringNumber", String(signal.matchRing));
      fd.append("cameraNumber", String(cameraNumber));
      fd.append("pressTime", String(signal.sentAt));
      fd.append("mimeType", blob.type);
      if (signal.exchangeId) {
        fd.append("exchangeId", String(signal.exchangeId));
      }

      try {
        const resp = await apiQuery(`${backend_uri}/${UPLOAD_PATH}`, {
          method: "POST",
          body: fd,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        setUploads((prev) =>
          prev.map((u) =>
            u.filename === filename ? { ...u, status: "ok" } : u
          )
        );
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
    [cameraNumber]
  );

  // ===================== Judgement signal handler =====================
  const handleJudgementSignal = useCallback(
    (signal: JudgementSignal) => {
      if (!initChunkRef.current) {
        console.warn("Judgement signal arrived before recorder ready");
        return;
      }

      updateOffset(signal.serverNow);

      const localPressTime = serverToLocal(signal.sentAt);
      const sliceStart = localPressTime - PRE_BUFFER_MS;
      const sliceEnd = localPressTime + POST_BUFFER_MS;

      const delay = Math.max(0, sliceEnd - Date.now()) + 100;

      setTimeout(() => {
        const blob = sliceBuffer(sliceStart, sliceEnd);
        if (!blob) {
          console.error("Slice produced no data for signal", signal);
          setUploads((prev) =>
            [
              {
                matchId: signal.matchId,
                pressTime: signal.sentAt,
                sizeBytes: 0,
                status: "error",
                errorMessage: "No buffered footage covered the press time.",
                filename: `match-${signal.matchId}-${signal.sentAt}-NOSLICE`,
                attemptedAt: Date.now(),
              } as ClipUploadRecord,
              ...prev,
            ].slice(0, 10)
          );
          return;
        }
        uploadClip(blob, signal);
      }, delay);
    },
    [serverToLocal, sliceBuffer, updateOffset, uploadClip]
  );

  // ===================== SSE =====================
  const connectToSSE = useCallback(
    (retry = 0) => {
      if (!ringNumber) return null;

      const url = `${backend_uri}/${sse_send_to_to_judge_api}?ringNumber=${ringNumber}`;
      const es = new EventSource(url);
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
          if (typeof data.serverNow === "number") {
            updateOffset(data.serverNow);
          }
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
          Math.min(30_000, 1_000 * Math.pow(2, retry)) +
          Math.random() * 500;
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
      try {
        wakeLockRef.current?.release();
      } catch {}
      wakeLockRef.current = null;
    };
  }, [acquireWakeLock]);

  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ===================== UI =====================
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
      <style>
        {`
          @keyframes eoj-pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.7); }
            100% { opacity: 1; transform: scale(1); }
          }
        `}
      </style>

      <h1 style={{ marginBottom: "4px" }}>Eye of Judgement</h1>
      <div style={{ fontSize: "0.9rem", opacity: 0.7, marginBottom: "12px" }}>
        Ring {ringNumber} · Camera {cameraNumber} · clip = {PRE_BUFFER_MS / 1000}s pre + {POST_BUFFER_MS / 1000}s post
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
        {mimeType && (
          <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>{mimeType}</span>
        )}
      </div>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={videoStyle}
      />

      <div style={{ marginTop: "12px" }}>
        {!recording ? (
          <button style={buttonStyle} onClick={startRecording}>
            Start Camera
          </button>
        ) : (
          <button style={dangerButtonStyle} onClick={stopRecording}>
            Stop Camera
          </button>
        )}
      </div>

      {errorMsg && (
        <div style={{ marginTop: "10px", color: "#ff6b6b" }}>{errorMsg}</div>
      )}

      <div style={{ marginTop: "20px" }}>
        <h3 style={{ marginBottom: "6px" }}>Recent clips</h3>
        {uploads.length === 0 ? (
          <div style={{ opacity: 0.6, fontSize: "0.9rem" }}>None yet.</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {uploads.map((u) => (
              <li
                key={`${u.filename}-${u.attemptedAt}`}
                style={{
                  padding: "6px 8px",
                  borderBottom: "1px solid #333",
                  fontSize: "0.85rem",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "8px",
                }}
              >
                <span>
                  Match {u.matchId} · {(u.sizeBytes / 1024).toFixed(0)} KB
                </span>
                <span
                  style={{
                    color:
                      u.status === "ok"
                        ? "#6ec06e"
                        : u.status === "error"
                        ? "#ff6b6b"
                        : "#e3c75b",
                  }}
                >
                  {u.status === "ok" && "✓ uploaded"}
                  {u.status === "uploading" && "↑ uploading"}
                  {u.status === "error" && `✗ ${u.errorMessage || "failed"}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default EyeOfJudgement;
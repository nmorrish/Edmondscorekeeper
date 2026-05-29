/**
 * src/components/Judgement/EyeOfJudgement/ExchangeVideoButtons.tsx
 *
 * Fully self-contained video controls for a single exchange. Drop
 * <ExchangeVideoButtons exchangeId={id} /> anywhere — it owns its own fetch,
 * state, playback, and modal. Nothing required from the parent but the id.
 *
 *  - "📹 Load videos" button (idle)
 *  - "▶ CAM N" buttons + refresh (loaded)
 *  - status text (loading / empty / error)
 *  - modal player that opens on CAM click, closes on ✕ / backdrop / Escape
 */

import React, { useState, useEffect } from "react";
import { backend_uri } from "../../utility/endpoints";

export interface ClipMeta {
  cameraNumber: number;
  filename: string;
  uploadedAt?: string;
}

// Clips folder, derived from backend_uri (sibling of phpFiles/).
const CLIPS_URL = backend_uri.replace(/\/[^/]+\/?$/, "/judgementClips");
const clipUrl = (clip: ClipMeta) =>
  `${CLIPS_URL}/cam-${clip.cameraNumber}/${clip.filename}`;

type VideoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; clips: ClipMeta[] }
  | { status: "empty" }
  | { status: "error"; message: string };

interface ExchangeVideoButtonsProps {
  exchangeId: number;
}

const ExchangeVideoButtons: React.FC<ExchangeVideoButtonsProps> = ({ exchangeId }) => {
  const [state, setState] = useState<VideoState>({ status: "idle" });
  const [playingClip, setPlayingClip] = useState<ClipMeta | null>(null);

  const load = async () => {
    setState({ status: "loading" });
    try {
      const resp = await fetch(
        `${backend_uri}/getJudgementClip.php?exchangeId=${exchangeId}`,
        { cache: "no-store" }
      );
      if (resp.status === 404) {
        setState({ status: "empty" });
        return;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data.status === "ok" && Array.isArray(data.clips) && data.clips.length > 0) {
        setState({ status: "loaded", clips: data.clips });
      } else {
        setState({ status: "empty" });
      }
    } catch (err: any) {
      setState({ status: "error", message: err?.message || "Failed to load" });
    }
  };

  const renderButtons = () => {
    if (state.status === "idle") {
      return (
        <button style={loadButtonStyle} onClick={load}>
          📹 Load videos
        </button>
      );
    }
    if (state.status === "loading") {
      return <span style={statusStyle}>Loading…</span>;
    }
    if (state.status === "empty") {
      return (
        <span style={statusStyle}>
          No videos for this exchange{" "}
          <button style={retryButtonStyle} onClick={load}>Refresh</button>
        </span>
      );
    }
    if (state.status === "error") {
      return (
        <span style={{ ...statusStyle, color: "#c44" }}>
          Error: {state.message}{" "}
          <button style={retryButtonStyle} onClick={load}>Retry</button>
        </span>
      );
    }
    // loaded
    return (
      <>
        {state.clips.map((clip) => (
          <button
            key={`${exchangeId}-cam-${clip.cameraNumber}`}
            style={camButtonStyle}
            onClick={() => setPlayingClip(clip)}
          >
            ▶ CAM {clip.cameraNumber}
          </button>
        ))}
        <button style={retryButtonStyle} onClick={load} title="Refresh camera list">
          ↻
        </button>
      </>
    );
  };

  return (
    <>
      {renderButtons()}
      {playingClip && (
        <VideoPlayerModal clip={playingClip} onClose={() => setPlayingClip(null)} />
      )}
    </>
  );
};

// ===================== Modal =====================
const VideoPlayerModal: React.FC<{ clip: ClipMeta; onClose: () => void }> = ({
  clip,
  onClose,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={modalBackdropStyle} onClick={onClose}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <span>CAM {clip.cameraNumber} · {clip.filename}</span>
          <button style={modalCloseButtonStyle} onClick={onClose}>✕</button>
        </div>
        <video src={clipUrl(clip)} controls autoPlay playsInline style={modalVideoStyle} />
      </div>
    </div>
  );
};

// ===================== Styles =====================
const loadButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: "0.8rem",
  background: "#333",
  color: "#eee",
  border: "1px solid #555",
  borderRadius: "4px",
  cursor: "pointer",
};

const camButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: "0.85rem",
  fontWeight: 600,
  background: "#1a3d6e",
  color: "#fff",
  border: "1px solid #2a5d8e",
  borderRadius: "4px",
  cursor: "pointer",
  marginRight: "6px",
};

const retryButtonStyle: React.CSSProperties = {
  ...loadButtonStyle,
  marginLeft: "8px",
  padding: "2px 8px",
  fontSize: "0.75rem",
};

const statusStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  fontStyle: "italic",
  opacity: 0.7,
};

const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.85)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
  padding: "20px",
};

const modalContentStyle: React.CSSProperties = {
  background: "#0a0a0a",
  borderRadius: "8px",
  maxWidth: "90vw",
  maxHeight: "90vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const modalHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 16px",
  background: "#1a1a1a",
  color: "#fff",
  fontSize: "0.85rem",
  fontFamily: "monospace",
  borderBottom: "1px solid #333",
};

const modalCloseButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: "#fff",
  border: "1px solid #555",
  borderRadius: "4px",
  width: "28px",
  height: "28px",
  cursor: "pointer",
  fontSize: "0.9rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const modalVideoStyle: React.CSSProperties = {
  width: "auto",
  maxWidth: "100%",
  maxHeight: "calc(90vh - 50px)",
  background: "#000",
};

export default ExchangeVideoButtons;
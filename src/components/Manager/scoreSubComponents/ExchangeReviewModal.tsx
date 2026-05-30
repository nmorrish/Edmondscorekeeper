import React, { useState, useEffect, useRef, useCallback } from "react";
import { backend_uri } from "../../utility/endpoints";
import JudgeScores from "./JudgeScores";
import { Exchange } from "../../utility/TotalsCalculator";

interface FighterInfo {
  fighterId: number;
  fighterName: string;
  fighterColor: string;
  exchanges: Exchange[];
}

interface ClipMeta {
  cameraNumber: number;
  relativePath: string; // full path from judgementClips/ inward, e.g. tournament_1/event_1/match_1/exchange_2/2-cam1.webm
}

interface ExchangeReviewModalProps {
  fighter1: FighterInfo;
  fighter2: FighterInfo;
  initialExchangeIndex?: number;
  initialCamIndex?: number;
  readOnly: boolean;
  onClose: (exchangeIndex: number, camIndex: number) => void;
}

const CLIPS_URL = backend_uri.replace(/\/[^/]+\/?$/, "/judgementClips");
const clipUrl = (clip: ClipMeta) => `${CLIPS_URL}/${clip.relativePath}`;
const FRAME_STEP = 1 / 30;

const ExchangeReviewModal: React.FC<ExchangeReviewModalProps> = ({
  fighter1,
  fighter2,
  initialExchangeIndex = 0,
  initialCamIndex = 0,
  readOnly,
  onClose,
}) => {
  const [exchangeIndex, setExchangeIndex] = useState(initialExchangeIndex);
  const [clips, setClips] = useState<ClipMeta[]>([]);
  const [clipStatus, setClipStatus] = useState<"loading" | "loaded" | "empty" | "error">("loading");
  const [camIndex, setCamIndex] = useState(initialCamIndex);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fullWidth, setFullWidth] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  const exchangeCount = Math.max(fighter1.exchanges.length, fighter2.exchanges.length);
  const f1Ex = fighter1.exchanges[exchangeIndex];
  const f2Ex = fighter2.exchanges[exchangeIndex];

  const fetchClips = useCallback(async () => {
    if (!f1Ex && !f2Ex) return;
    setClipStatus("loading");
    setCamIndex(0);

    const tryFetch = async (exchangeId: number): Promise<ClipMeta[] | null> => {
      try {
        const resp = await fetch(
          `${backend_uri}/getJudgementClip.php?exchangeId=${exchangeId}`,
          { cache: "no-store" }
        );
        if (!resp.ok) return null;
        const data = await resp.json();
        return data.status === "ok" && Array.isArray(data.clips) && data.clips.length > 0
          ? data.clips
          : null;
      } catch {
        return null;
      }
    };

    try {
      const result =
        (f1Ex ? await tryFetch(f1Ex.exchangeId) : null) ??
        (f2Ex ? await tryFetch(f2Ex.exchangeId) : null);
      if (result) {
        setClips(result);
        setClipStatus("loaded");
      } else {
        setClips([]);
        setClipStatus("empty");
      }
    } catch {
      setClipStatus("error");
    }
  }, [f1Ex?.exchangeId, f2Ex?.exchangeId]);

  useEffect(() => { fetchClips(); }, [fetchClips]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
  }, [exchangeIndex]);

  const stepFrame = useCallback((dir: 1 | -1) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + dir * FRAME_STEP));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(exchangeIndex, camIndex);
      if (e.key === "ArrowLeft") stepFrame(-1);
      if (e.key === "ArrowRight") stepFrame(1);
      if (e.key === "f") setFullWidth((fw) => !fw);
      if (e.key === " ") {
        e.preventDefault();
        const v = videoRef.current;
        if (!v) return;
        v.paused ? v.play() : v.pause();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, stepFrame, exchangeIndex, camIndex, fullWidth]);

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    setDuration(v.duration || 0);
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const t = parseFloat(e.target.value);
    v.currentTime = t;
    setCurrentTime(t);
  };

  const currentClip = clipStatus === "loaded" && clips.length > 0 ? clips[camIndex] : null;

  if (!f1Ex || !f2Ex) return null;

  const camLabel = () => {
    if (clipStatus === "loading") return "Loading…";
    if (clipStatus === "empty") return "No footage";
    if (clipStatus === "error") return "Error";
    if (clipStatus === "loaded") return currentClip ? `CAM ${currentClip.cameraNumber}` : "No cameras";
  };

  return (
    <div style={backdropStyle} onClick={() => onClose(exchangeIndex, camIndex)}>
        <div
            style={{
                ...modalStyle,
                width: fullWidth ? "100vw" : "min(900px, 96vw)",
                maxWidth: fullWidth ? "100vw" : undefined,
                borderRadius: fullWidth ? 0 : "10px",
                overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
        >

        {/* Combined nav row: exchange selector | cam selector | close */}
        <div style={navRowStyle}>

          {/* Exchange nav */}
          <div style={navGroupStyle}>
            <button
              style={navBtnStyle}
              onClick={() => setExchangeIndex((i) => Math.max(0, i - 1))}
              disabled={exchangeIndex === 0}
            >◀</button>
            <span style={navLabelStyle}>
              Exchange {exchangeIndex + 1} / {exchangeCount}
            </span>
            <button
              style={navBtnStyle}
              onClick={() => setExchangeIndex((i) => Math.min(exchangeCount - 1, i + 1))}
              disabled={exchangeIndex >= exchangeCount - 1}
            >▶</button>
          </div>

          <div style={dividerStyle} />

          {/* Camera nav */}
          <div style={navGroupStyle}>
            <button
              style={navBtnStyle}
              onClick={() => setCamIndex((i) => (i - 1 + clips.length) % clips.length)}
              disabled={clips.length < 2}
            >◀</button>
            <span style={navLabelStyle}>
              {camLabel()}
              {clipStatus === "error" && (
                <button style={retryBtnStyle} onClick={fetchClips}>Retry</button>
              )}
            </span>
            <button
              style={navBtnStyle}
              onClick={() => setCamIndex((i) => (i + 1) % clips.length)}
              disabled={clips.length < 2}
            >▶</button>
          </div>

          {/* Full width */}
          <button style={navBtnStyle} onClick={() => setFullWidth((fw) => !fw)} title="Toggle full width (F)">
            {fullWidth ? "(F) Close" : "(F)ull Width"}
          </button>

          <button style={closeBtnStyle} onClick={() => onClose(exchangeIndex, camIndex)}>✕</button>
        </div>

        {/* Video */}
        {currentClip ? (
          <video
            key={currentClip.relativePath}
            ref={videoRef}
            src={clipUrl(currentClip)}
            style={{
                ...videoStyle,
                maxHeight: fullWidth ? "92vh" : "80vh",
            }}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleTimeUpdate}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            playsInline
          />
        ) : (
          <div style={{ ...videoPlaceholderStyle, height: fullWidth ? "80vh" : "200px" }}>
            {clipStatus === "loading" ? "Loading video…" : "No footage for this exchange"}
          </div>
        )}

        {/* Scrub controls */}
        <div style={controlsStyle}>
          <button style={navBtnStyle} onClick={() => stepFrame(-1)} title="Previous frame (←)">
            ‹ Frame
          </button>
          <button
            style={{ ...navBtnStyle, minWidth: "52px" }}
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              v.paused ? v.play() : v.pause();
            }}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <button style={navBtnStyle} onClick={() => stepFrame(1)} title="Next frame (→)">
            Frame ›
          </button>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.001}
            value={currentTime}
            onChange={handleScrub}
            style={scrubStyle}
            disabled={!currentClip}
          />
          <span style={timeLabelStyle}>
            {currentTime.toFixed(2)}s / {(duration || 0).toFixed(2)}s
          </span>
        </div>

        {/* Score panels */}
        <div style={scorePanelsStyle}>
          {[
            { info: fighter1, ex: f1Ex },
            { info: fighter2, ex: f2Ex },
          ].map(({ info, ex }) => (
            <div
              key={info.fighterId}
              style={scorePanelStyle}
              className={`border-${info.fighterColor}`}
            >
              <div style={panelHeaderStyle} className={info.fighterColor}>
                {info.fighterName} ({info.fighterColor})
              </div>
              <div style={{ padding: "12px 14px" }}>
                <JudgeScores
                  fighterId={info.fighterId}
                  exchanges={[{
                    exchangeId: ex.exchangeId,
                    exchangeTimeStamp: ex.exchangeTimeStamp,
                    scores: ex.scores,
                  }]}
                  readOnly={readOnly}
                  indexOffset={exchangeIndex}
                />
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};

// ── Styles ──────────────────────────────────────────────

const backdropStyle: React.CSSProperties = {
  position: "fixed", inset: 0,
  background: "rgba(0,0,0,0.88)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 9999, padding: "16px",
};
const modalStyle: React.CSSProperties = {
  background: "#111", borderRadius: "10px",
  width: "min(900px, 96vw)", maxHeight: "95vh",
  display: "flex", flexDirection: "column", overflow: "hidden",
  color: "#eee",
};
const navRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center",
  gap: "12px", padding: "10px 16px",
  background: "#1a1a1a", borderBottom: "1px solid #333",
};
const navGroupStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "8px",
};
const navLabelStyle: React.CSSProperties = {
  minWidth: "110px", textAlign: "center",
  fontWeight: 700, fontSize: "1.5rem",
  color: "#fff", letterSpacing: "0.03em",
};
const dividerStyle: React.CSSProperties = {
  width: "1px", height: "24px",
  background: "#444", margin: "0 4px",
};
const closeBtnStyle: React.CSSProperties = {
  marginLeft: "auto",
  background: "transparent", color: "#fff",
  border: "1px solid #555", borderRadius: "4px",
  width: "28px", height: "28px", cursor: "pointer", fontSize: "0.9rem",
};
const navBtnStyle: React.CSSProperties = {
  padding: "6px 14px", fontSize: "1.3rem",
  background: "#2a2a2a", color: "#eee",
  border: "1px solid #444", borderRadius: "4px", cursor: "pointer",
};
const retryBtnStyle: React.CSSProperties = {
  padding: "2px 8px", fontSize: "0.75rem", marginLeft: "6px",
  background: "#2a2a2a", color: "#eee",
  border: "1px solid #444", borderRadius: "4px", cursor: "pointer",
};
const videoStyle: React.CSSProperties = {
  width: "100%", maxHeight: "50vh",
  background: "#000", display: "block",
};
const videoPlaceholderStyle: React.CSSProperties = {
  width: "100%", height: "200px",
  background: "#0a0a0a",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "#666", fontStyle: "italic", fontSize: "0.9rem",
};
const controlsStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "8px",
  padding: "10px 14px", background: "#161616",
  borderBottom: "1px solid #2a2a2a", flexWrap: "wrap",
};
const scrubStyle: React.CSSProperties = {
  flex: 1, minWidth: "120px", height: "28px",
  accentColor: "#4a90d9", cursor: "pointer",
};
const timeLabelStyle: React.CSSProperties = {
  fontSize: "0.75rem", opacity: 0.7,
  whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
};
const scorePanelsStyle: React.CSSProperties = {
  display: "flex", overflowY: "visible",
};
const scorePanelStyle: React.CSSProperties = {
  flex: 1, padding: "12px 14px",
  borderRight: "1px solid #2a2a2a", minWidth: 0,
};
const panelHeaderStyle: React.CSSProperties = {
  fontWeight: 700, marginBottom: "8px",
  textTransform: "capitalize", fontSize: "1.8em",
};

export default ExchangeReviewModal;
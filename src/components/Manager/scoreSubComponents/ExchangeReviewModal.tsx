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
  const [playbackRate, setPlaybackRate] = useState(1);

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

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  };

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
  if (currentClip) console.log("Video URL:", clipUrl(currentClip));

  if (!f1Ex || !f2Ex) return null;

  const camLabel = () => {
    if (clipStatus === "loading") return "Loading…";
    if (clipStatus === "empty") return "No footage";
    if (clipStatus === "error") return "Error";
    if (clipStatus === "loaded") return currentClip ? `CAM ${currentClip.cameraNumber}` : "No cameras";
  };

  return (
    <div className="modal-backdrop" onClick={() => onClose(exchangeIndex, camIndex)}>
      <div
        className={`modal${fullWidth ? " full-width" : ""}`}
        style={{ overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* Combined nav row: exchange selector | cam selector | close */}
        <div className="modal-nav-row">

          {/* Exchange nav */}
          <div className="modal-nav-group">
            <button
              className="btn-neutral"
              onClick={() => setExchangeIndex((i) => Math.max(0, i - 1))}
              disabled={exchangeIndex === 0}
            >◀</button>
            <span className="modal-nav-label">
              Exchange {exchangeIndex + 1} / {exchangeCount}
            </span>
            <button
              className="btn-neutral"
              onClick={() => setExchangeIndex((i) => Math.min(exchangeCount - 1, i + 1))}
              disabled={exchangeIndex >= exchangeCount - 1}
            >▶</button>
          </div>

          <div className="modal-divider" />

          {/* Camera nav */}
          <div className="modal-nav-group">
            <button
              className="btn-neutral"
              onClick={() => setCamIndex((i) => (i - 1 + clips.length) % clips.length)}
              disabled={clips.length < 2}
            >◀</button>
            <span className="modal-nav-label">
              {camLabel()}
              {clipStatus === "error" && (
                <button className="btn-neutral" onClick={fetchClips}>Retry</button>
              )}
            </span>
            <button
              className="btn-neutral"
              onClick={() => setCamIndex((i) => (i + 1) % clips.length)}
              disabled={clips.length < 2}
            >▶</button>
          </div>

          {/* Full width */}
          <button className="btn-neutral" onClick={() => setFullWidth((fw) => !fw)} title="Toggle full width (F)">
            {fullWidth ? "(F) Close" : "(F)ull Width"}
          </button>

          <button className="btn-neutral review-close-btn" onClick={() => onClose(exchangeIndex, camIndex)}>✕</button>
        </div>

        {/* Video */}
        {currentClip ? (
          <video
            key={currentClip.relativePath}
            ref={videoRef}
            className="review-video"
            src={clipUrl(currentClip)}
            onError={(e) => console.error("Video error:", e.currentTarget.error?.code, e.currentTarget.error?.message)}
            onLoadedMetadata={() => {
              if (videoRef.current) videoRef.current.playbackRate = playbackRate;
              handleTimeUpdate();
            }}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            playsInline
          />
        ) : (
          <div className="review-video-placeholder">
            {clipStatus === "loading" ? "Loading video…" : "No footage for this exchange"}
          </div>
        )}

        {/* Scrub controls */}
        <div className="control-row">
          <button className="btn-neutral" onClick={() => stepFrame(-1)} title="Previous frame (←)">
            ‹ Frame
          </button>
          <button
            className="btn-neutral"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              v.paused ? v.play() : v.pause();
            }}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <button className="btn-neutral" onClick={() => stepFrame(1)} title="Next frame (→)">
            Frame ›
          </button>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.001}
            value={currentTime}
            onChange={handleScrub}
            className="review-scrub"
            disabled={!currentClip}
          />
          <span className="review-time-label">
            {currentTime.toFixed(2)}s / {(duration || 0).toFixed(2)}s
          </span>
          <div className="review-speed-group">
            {[0.10, 0.25, 0.5, 1, 1.5].map((rate) => (
              <button
                key={rate}
                className={`btn-neutral review-speed-btn${playbackRate === rate ? " active" : ""}`}
                onClick={() => handleRateChange(rate)}
              >
                {rate}×
              </button>
            ))}
          </div>
        </div>

        {/* Score panels */}
        <div className="review-score-panels">
          {[
            { info: fighter1, ex: f1Ex },
            { info: fighter2, ex: f2Ex },
          ].map(({ info, ex }) => (
            <div
              key={info.fighterId}
              className={`review-score-panel border-${info.fighterColor}`}
            >
              <div className={`review-panel-header ${info.fighterColor}`}>
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

export default ExchangeReviewModal;
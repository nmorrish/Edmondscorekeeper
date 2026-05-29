/**
 * src/components/Manager/subComponents/TriggerJudgement.tsx
 *
 * == Judgement Trigger Buttons ==
 * Integrates a 60 second timer with the Judgement signal.
 * - Start → if not active, set match to Active ('A') via matchesApi.php
 * - Stop → updates Matches.lastMatchJudgement + creates new Exchanges
 * - Refresh → updates Matches.lastMatchJudgement only
 */

import React, { useCallback, useState, useEffect, useRef } from "react";
import { backend_uri, match_api } from "../../utility/endpoints";
import { useToast } from "../../utility/ToastProvider";
import { apiQuery } from "../../utility/apiClient";

interface TriggerJudgementProps {
  matchId: number;
  refresh: boolean; // Determines whether to show the timer or refresh button
  isActive?: boolean;
  onActivate?: () => void;
}

type PersistedTimer = {
  running: boolean;
  remainingMs: number;   // when paused (or initial full duration)
  startedAt: number | null; // epoch ms when running started
};

const DURATION_MS = 60_000;

const TriggerJudgement: React.FC<TriggerJudgementProps> = ({
  matchId,
  refresh,
  isActive = false,
  onActivate,
}) => {
  const [loading, setLoading] = useState(false);
  const [displayMs, setDisplayMs] = useState<number>(DURATION_MS);
  const [isRunning, setIsRunning] = useState(false);
  const tickRef = useRef<number | null>(null);
  const addToast = useToast();

  const STORAGE_KEY = `judgementTimer_v2:${matchId}`;

  // --- helpers: storage load/save ---
  const loadPersisted = (): PersistedTimer => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedTimer;
        // sanity checks
        return {
          running: !!parsed.running,
          remainingMs:
            typeof parsed.remainingMs === "number"
              ? parsed.remainingMs
              : DURATION_MS,
          startedAt:
            typeof parsed.startedAt === "number" ? parsed.startedAt : null,
        };
      }
    } catch (_) {}
    return { running: false, remainingMs: DURATION_MS, startedAt: null };
  };

  const savePersisted = (val: PersistedTimer) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
    } catch (_) {
      // ignore quota errors etc.
    }
  };

  // === Perform action on matchesApi.php ===
  const performAction = useCallback(
    async (action: string, extra: Record<string, any> = {}) => {
      try {
        setLoading(true);
        const response = await apiQuery(`${backend_uri}/${match_api}?id=${matchId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        });

        if (!response.ok) throw new Error(`Failed ${action}`);

        const data = await response.json();
        if (data.status === "success") {
          addToast(`Match ${action} successful.`);
          if (action === "activate" && onActivate) onActivate();
        } else {
          addToast(`Error: ${data.message || "Unknown error"}`);
        }
      } catch (err) {
        console.error(`Error performing ${action}:`, err);
        addToast(`Error performing ${action}.`);
      } finally {
        setLoading(false);
      }
    },
    [matchId, onActivate, addToast]
  );

  // === If this instance is the refresh-only button, render early and don't touch timer state ===
  if (refresh) {
    return (
      <div>
        <button onClick={() => performAction("refreshJudgement")} disabled={loading}>
          Refresh Judgement
        </button>
        {loading && <p>Loading...</p>}
      </div>
    );
  }

  // === Activate match ===
  const activateMatch = useCallback(async () => {
    if (isActive) {
      console.log(`Match ${matchId} already active, skipping activation call.`);
      return;
    }
    await performAction("activate");
  }, [isActive, matchId, performAction]);

  // === Start/Stop (persisted, wall-clock based) ===
  const startTimer = useCallback(() => {
    const p = loadPersisted();

    if (p.running) return; // already running

    
    const remaining = p.remainingMs;

    const next: PersistedTimer = {
      running: true,
      remainingMs: remaining,
      startedAt: Date.now(),
    };

    savePersisted(next);
    setIsRunning(true);
    activateMatch();
  }, [activateMatch]);

  const stopTimer = useCallback(() => {
  const p = loadPersisted();

    // Snapshot the actual wall-clock duration of this exchange
    const stoppedAt = Date.now();
    const exchangeDurationMs =
      p.running && p.startedAt ? Math.max(0, stoppedAt - p.startedAt) : 0;

    let remaining = p.remainingMs;
    if (p.running && p.startedAt) {
      remaining = p.remainingMs - (stoppedAt - p.startedAt);
    }

    const next: PersistedTimer = {
      running: false,
      remainingMs: remaining,
      startedAt: null,
    };

    savePersisted(next);
    setIsRunning(false);
    setDisplayMs(remaining);

    // Send duration so the camera can slice the exact exchange window
    performAction("judgement", { exchangeDurationMs });
  }, [performAction]);

  // === On mount: restore and compute the correct remaining time from wall clock ===
  useEffect(() => {
    const p = loadPersisted();

    if (p.running && p.startedAt) {
      const elapsed = Date.now() - p.startedAt;
      const remaining = p.remainingMs - elapsed;

      setIsRunning(true);
      setDisplayMs(remaining);
    } else {
      setDisplayMs(p.remainingMs);
  }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [STORAGE_KEY]);

  // === Ticker (100ms) when running; driven by wall clock, not drift-prone state decrements ===
  useEffect(() => {
    if (!isRunning) return;

    tickRef.current = window.setInterval(() => {
      const p = loadPersisted();
      if (!p.running || !p.startedAt) {
        setIsRunning(false);
        if (tickRef.current) clearInterval(tickRef.current);
        return;
      }
      const elapsed = Date.now() - p.startedAt;
      const remaining = p.remainingMs - elapsed;

      setDisplayMs(remaining);
    }, 100);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, STORAGE_KEY]);

  // === Cleanup: persist up-to-date state on unmount ===
  useEffect(() => {
    return () => {
      const p = loadPersisted();
      if (p.running && p.startedAt) {
        const elapsed = Date.now() - p.startedAt;
        const remaining = p.remainingMs - elapsed;
        savePersisted({ running: false, remainingMs: remaining, startedAt: null });
      } else {
        savePersisted(p);
      }
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = (ms: number) => {
    const sign = ms < 0 ? "-" : "";
    return `${sign}${(Math.abs(ms) / 1000).toFixed(1)}`;
  };

  return (
    <div>
      <button
        onClick={isRunning ? stopTimer : startTimer}
        disabled={loading}
        style={{ fontSize: "30px" }}
      >
        {isRunning ? `Stop (${formatTime(displayMs)}s)` : `Start (${formatTime(displayMs)}s)`}
      </button>
      {loading && <p>Loading...</p>}
    </div>
  );
};

export default React.memo(TriggerJudgement);

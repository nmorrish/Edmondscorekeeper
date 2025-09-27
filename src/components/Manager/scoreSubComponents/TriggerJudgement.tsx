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

interface TriggerJudgementProps {
  matchId: number;
  refresh: boolean; // Determines whether to show the timer or refresh button
  isActive?: boolean;
  onActivate?: () => void;
}

const TriggerJudgement: React.FC<TriggerJudgementProps> = ({
  matchId,
  refresh,
  isActive = false,
  onActivate,
}) => {
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(60);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const addToast = useToast();

  // === Perform action on matchesApi.php ===
  const performAction = useCallback(
    async (action: string) => {
      try {
        const response = await fetch(`${backend_uri}/${match_api}?id=${matchId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
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
      }
    },
    [matchId, onActivate, addToast]
  );

  // === Activate match ===
  const activateMatch = useCallback(async () => {
    if (isActive) {
      console.log(`Match ${matchId} already active, skipping activation call.`);
      return;
    }
    await performAction("activate");
  }, [isActive, matchId, performAction]);

  const startTimer = useCallback(() => {
    if (!isRunning) {
      activateMatch();
      setIsRunning(true);
    }
  }, [isRunning, activateMatch]);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRunning(false);
    performAction("judgement");
  }, [performAction]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        setTimer((prev) => prev - 0.1);
      }, 100);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [isRunning]);

  useEffect(() => {
    if (!refresh) setTimer(60);
  }, [refresh]);

  const formatTime = (time: number) => time.toFixed(1);

  return (
    <div>
      {refresh ? (
        <button onClick={() => performAction("refreshJudgement")} disabled={loading}>
          Refresh Judgement
        </button>
      ) : (
        <button
          onClick={isRunning ? stopTimer : startTimer}
          disabled={loading}
          style={{ fontSize: "30px" }}
        >
          {isRunning ? `Stop (${formatTime(timer)}s)` : `Start (${formatTime(timer)}s)`}
        </button>
      )}
      {loading && <p>Loading...</p>}
    </div>
  );
};

export default React.memo(TriggerJudgement);

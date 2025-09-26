/**
 * src/components/Manager/subComponents/TriggerJudgement.tsx
 *
 * == Judgement Trigger Buttons ==
 * Integrates a 60 second timer with the Judgement signal.
 * - Start → if not active, set match to Active ('A') via API, then start timer
 * - Stop → updates Matches.lastMatchJudgement + creates new Exchanges
 * - Refresh → updates Matches.lastMatchJudgement only
 */

import React, { useCallback, useState, useEffect, useRef } from "react";
import { backend_uri, match_api } from "../../utility/endpoints";
import { useToast } from "../../utility/ToastProvider";

interface TriggerJudgementProps {
  matchId: number;
  refresh: boolean; // Determines whether to show the timer or refresh button
  isActive?: boolean; // 🔑 pass current active status
  onActivate?: () => void; // callback to notify parent state
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

  // === Activate match API ===
  const activateMatch = useCallback(async () => {
    if (isActive) {
      console.log(`Match ${matchId} already active, skipping activation call.`);
      return; // 🚫 skip redundant activation
    }

    try {
      const endpoint = `${backend_uri}/${match_api}?id=${matchId}`;
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate" }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === "success") {
          addToast("Match activated.");
          if (onActivate) onActivate();
        } else if (data.status === "noop") {
          console.log("Server: Match already active (noop).");
        } else {
          addToast("Failed to activate match.");
        }
      } else {
        addToast("Network error activating match.");
      }
    } catch (err) {
      console.error("Error activating match:", err);
      addToast("Failed to activate match.");
    }
  }, [matchId, isActive, onActivate, addToast]);

  // Function to start the timer countdown
  const startTimer = useCallback(() => {
    if (!isRunning) {
      activateMatch();
      setIsRunning(true);
    }
  }, [isRunning, activateMatch]);

  // Function to stop the timer and trigger judgement
  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setIsRunning(false);
    triggerJudgement();
  }, []);

  // Handle the countdown
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

  // Prevent reset on rerender
  useEffect(() => {
    if (refresh) return;
    setTimer(60);
  }, [refresh]);

  // Stop button → judgement action
  const triggerJudgement = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    try {
      const endpoint = `${backend_uri}/${match_api}?id=${matchId}`;
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "judgement" }),
      });

      if (!response.ok) throw new Error("Network response was not ok");

      addToast("Judgement triggered successfully.");
    } catch (error) {
      console.error("Error triggering judgement:", error);
      addToast("An error occurred while processing the judgement. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [matchId, loading, addToast]);

  // Refresh button → refreshJudgement action
  const refreshJudgement = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = `${backend_uri}/${match_api}?id=${matchId}`;
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refreshJudgement" }),
      });

      if (!response.ok) throw new Error("Network response was not ok");

      addToast("Judgement refreshed successfully.");
    } catch (error) {
      console.error("Error refreshing judgement:", error);
      addToast("Error refreshing judgement.");
    } finally {
      setLoading(false);
    }
  }, [matchId, addToast]);

  const formatTime = (time: number) => time.toFixed(1);

  return (
    <div>
      {refresh ? (
        <button onClick={refreshJudgement} disabled={loading}>
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

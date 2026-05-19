/**
 * src/components/Judgement/RefereeFactCheck.tsx
 *
 * == Referee Fact-Check Page ==
 * Routed at /referee-check/:ringNumber
 *
 * Flow:
 *   1. On mount, call matchApi.php?ringNo=N&active=1 to find the active match
 *      and its eventId.
 *   2. With matchId + eventId, call scoresApi.php?eventId=X&ringNo=N for the
 *      full exchange/score data and render JudgeScores checkboxes.
 *   3. updateJudgementSSE re-triggers the score fetch when a judge submits.
 *   4. If no active match, show a waiting state. The SSE will re-trigger the
 *      active-match lookup when the next exchange is submitted, catching the
 *      moment a match becomes active.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { backend_uri, match_api, score_api } from "../utility/endpoints";
import { apiQuery } from "../utility/apiClient";
import JudgeScores from "../Manager/scoreSubComponents/JudgeScores";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Score {
  scoreId: number;
  judgeName: string;
  contact: boolean;
  target: boolean;
  control: boolean;
  afterBlow: boolean;
  opponentSelfCall: boolean;
  doubleHit: boolean;
}

interface Exchange {
  exchangeId: number;
  exchangeTimeStamp?: string;
  scores: Score[];
}

interface Fighter {
  fighterId: number;
  fighterName: string;
  fighterColor: string;
  exchanges: Exchange[];
}

interface ActiveMatch {
  matchId: number;
  eventId: number;
  fighters: Fighter[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const RefereeFactCheck: React.FC = () => {
  const { ringNumber } = useParams<{ ringNumber: string }>();
  const navigate = useNavigate();

  const [activeMatch, setActiveMatch] = useState<ActiveMatch | null>(null);
  const [waiting, setWaiting] = useState(true);
  const [availableRings, setAvailableRings] = useState<number[]>([]);
  const [showRingSelect, setShowRingSelect] = useState(false);

  // Ref so the SSE handler can read the current activeMatch without
  // being a dependency of the SSE effect (which caused the request loop)
  const activeMatchRef = useRef<ActiveMatch | null>(null);
  useEffect(() => {
    activeMatchRef.current = activeMatch;
  }, [activeMatch]);

  const buttonStyle: React.CSSProperties = {
    backgroundColor: "#222",
    color: "#fff",
    border: "1px solid #444",
    padding: "0.6rem 1.2rem",
    margin: "0.4rem",
    borderRadius: "6px",
    fontWeight: 600,
    cursor: "pointer",
  };

  // -- Step 2: fetch full exchange/score data with eventId in hand --
  const fetchScores = useCallback(async (matchId: number, eventId: number) => {
    if (!ringNumber) return;
    try {
      const resp = await apiQuery(
        `${backend_uri}/${score_api}?eventId=${eventId}&ringNo=${ringNumber}`
      );
      const data = await resp.json();

      if (data?.status === "success" && Array.isArray(data.matches)) {
        const match = data.matches.find((m: any) => m.matchId === matchId);
        if (match) {
          setActiveMatch({
            matchId: match.matchId,
            eventId,
            fighters: (match.fighters || []).map((f: any) => ({
              fighterId: f.fighterId,
              fighterName: f.fighterName,
              fighterColor: f.fighterColor,
              exchanges: f.exchanges || [],
            })),
          });
        }
      }
    } catch (err) {
      console.error("Error fetching scores:", err);
    } finally {
      setWaiting(false);
    }
  }, [ringNumber]);

  // -- Step 1: find the active match for this ring --
  const fetchActiveMatch = useCallback(async () => {
    if (!ringNumber) return;
    try {
      const resp = await apiQuery(
        `${backend_uri}/${match_api}?ringNo=${ringNumber}&active=1`
      );
      const data = await resp.json();

      if (data?.status === "success" && data.match) {
        const { matchId, eventId } = data.match;
        fetchScores(matchId, eventId);
      } else {
        setActiveMatch(null);
        setWaiting(false);
      }
    } catch (err) {
      console.error("Error fetching active match:", err);
      setActiveMatch(null);
      setWaiting(false);
    }
  }, [ringNumber, fetchScores]);

  // Run step 1 on mount and when ringNumber changes
  useEffect(() => {
    setWaiting(true);
    setActiveMatch(null);
    fetchActiveMatch();
  }, [fetchActiveMatch]);

  // -- SSE: when a judge submits, re-fetch scores if we have an active match,
  //    or re-check for an active match if we're in waiting state.
  //    activeMatch is read via ref to avoid this effect re-running on every
  //    score update (which caused the 400+ request loop). --
  useEffect(() => {
    const es = new EventSource(`${backend_uri}/updateJudgementSSE.php`);
    es.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload?.status === "Match updated") {
          if (activeMatchRef.current) {
            fetchScores(activeMatchRef.current.matchId, activeMatchRef.current.eventId);
          } else {
            fetchActiveMatch();
          }
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [fetchScores, fetchActiveMatch]);

  // -- Fetch available rings for the Change Ring button --
  useEffect(() => {
    (async () => {
      try {
        const resp = await apiQuery(`${backend_uri}/eventApi.php?ringsOnly=1`);
        const data = await resp.json();
        if (data.status === "success" && data.maxRings > 0) {
          setAvailableRings(
            Array.from({ length: data.maxRings }, (_, i) => i + 1)
          );
        } else {
          setAvailableRings([1]);
        }
      } catch {
        setAvailableRings([1]);
      }
    })();
  }, []);

  // ---- Ring picker overlay ----
  if (showRingSelect) {
    return (
      <div>
        <h1>Select Ring</h1>
        {availableRings.map((r) => (
          <button
            key={r}
            onClick={() => {
              navigate(`/referee-check/${r}`);
              setShowRingSelect(false);
            }}
            style={buttonStyle}
          >
            Ring {r}
          </button>
        ))}
        <button onClick={() => setShowRingSelect(false)} style={buttonStyle}>
          Cancel
        </button>
      </div>
    );
  }

  // ---- Header ----
  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
      <h1 style={{ margin: 0, fontSize: 25 }}>
        Referee Check
      </h1>
      <button onClick={() => setShowRingSelect(true)} style={buttonStyle}>
        Change Ring
      </button>
    </div>
  );

  // ---- Waiting / no active match ----
  if (waiting) {
    return (
      <div style={{ padding: "1rem" }}>
        {header}
        <p style={{ fontStyle: "italic" }}>Loading…</p>
      </div>
    );
  }

  if (!activeMatch) {
    return (
      <div style={{ padding: "1rem" }}>
        {header}
        <p style={{ fontStyle: "italic" }}>
          Waiting for an active match on Ring {ringNumber}…
        </p>
      </div>
    );
  }

  // ---- Main view: JudgeScores per fighter ----
  return (
    <div style={{ padding: "1rem" }}>
      {header}
      <p style={{ fontStyle: "italic" }}>
        Toggle any checkbox to correct a judge's score. Changes save immediately.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        {activeMatch.fighters.map((f) => (
          <div key={`${activeMatch.matchId}-${f.fighterId}`}>
            <h2 className={f.fighterColor}>
              {f.fighterName} ({f.fighterColor})
            </h2>
            {f.exchanges.length > 0 ? (
              <JudgeScores
                fighterId={f.fighterId}
                exchanges={f.exchanges}
                readOnly={false}
              />
            ) : (
              <p style={{ fontStyle: "italic" }}>Waiting for first judgement…</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default RefereeFactCheck;
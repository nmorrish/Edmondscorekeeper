/**
 * src/components/Manager/subComponents/MatchTables.tsx
 *
 * === Match Tables ===
 * Displays matches for the selected Event + Ring.
 * Uses matchesApi.php for metadata and scoresApi.php for fighters + scores.
 * Always pulls scores to ensure judges are synced after crashes/reconnects.
 */

import React, { useState, useEffect, useCallback } from "react";
import TriggerJudgement from "./TriggerJudgement";
import MatchActions from "../matchSubComponents/matchActions";
import { useRefresh } from "../../utility/RefreshContext";
import { backend_uri, match_api, score_api } from "../../utility/endpoints";
import ScoreDisplayComponent from "./ScoreDisplayComponent";
import FighterDropdown from "../matchSubComponents/fighterDropdown";
import { useToast } from "../../utility/ToastProvider";
import debounce from "lodash/debounce";
import { Fighter } from "../subComponents/useFighters";

// --- Types from scoresApi.php ---
export interface Score {
  scoreId: number;
  judgeName: string;
  contact: boolean;
  target: boolean;
  control: boolean;
  afterBlow: boolean;
  opponentSelfCall: boolean;
  doubleHit: boolean;
  scoreTimeStamp: string;
}

export interface Exchange {
  exchangeId: number;
  exchangeTimeStamp: string;
  scores: Score[];
}

export interface FighterWithExchanges {
  fighterId: number;
  fighterName: string;
  fighterColor: string;
  strikes: number;
  exchanges: Exchange[];
}

export interface Match {
  matchId: number;
  matchRing: number;
  fighters: FighterWithExchanges[];
  Active: boolean;
  matchComplete: boolean;
  PendingActiveDone?: "P" | "A" | "D";
}

interface MatchTablesProps {
  ringNumber: number;
  eventId: number;
  tournamentId: number;
  fighters: Fighter[];
  onStrikeUpdate: (fighterId: number, newStrikes: number) => void;
}

const MatchTables: React.FC<MatchTablesProps> = ({
  ringNumber,
  eventId,
  tournamentId,
  fighters,
  onStrikeUpdate,
}) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [visibleMatches, setVisibleMatches] = useState<Record<number, boolean>>({});
  const [fighterTotals, setFighterTotals] = useState<Record<number, Record<number, string>>>({});
  const { refreshKey, triggerRefresh } = useRefresh();
  const addToast = useToast();

  // --- Fetch Matches + Scores ---
  const fetchMatches = useCallback(
    debounce(async () => {
      if (!eventId || !tournamentId || !ringNumber) return;

      try {
        const resp = await fetch(
          `${backend_uri}/${match_api}?tournamentId=${tournamentId}&eventId=${eventId}&matchRing=${ringNumber}`
        );
        const baseData = await resp.json();

        if (baseData?.status === "success" && Array.isArray(baseData.matches)) {
          const scoredMatches: Match[] = [];
          for (const m of baseData.matches) {
            const scoreResp = await fetch(`${backend_uri}/${score_api}?matchId=${m.MatchId}`);
            const scoreData = await scoreResp.json();

            if (scoreData?.status === "success" && Array.isArray(scoreData.matches)) {
              const matchWithScores = scoreData.matches[0];
              scoredMatches.push({
                matchId: matchWithScores.matchId,
                matchRing: matchWithScores.matchRing,
                Active: matchWithScores.pendingActiveDone === "A",
                matchComplete: matchWithScores.pendingActiveDone === "D",
                PendingActiveDone: matchWithScores.pendingActiveDone,
                fighters: (matchWithScores.fighters || []).map((f: any) => ({
                  fighterId: f.fighterId,
                  fighterName: f.fighterName,
                  fighterColor: f.fighterColor,
                  strikes: f.strikes ?? 0,
                  exchanges: f.exchanges || [],
                })),
              });
            }
          }
          setMatches(scoredMatches);
        } else {
          setMatches([]);
        }
      } catch (err) {
        console.error("Error fetching matches with scores:", err);
        setMatches([]);
      }
    }, 400),
    [ringNumber, eventId, tournamentId]
  );

  // --- SSE for live updates ---
  const connectToSSE = useCallback(() => {
    const eventSource = new EventSource(`${backend_uri}/updateJudgementSSE.php`);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.status === "Match updated") {
          fetchMatches();
          addToast("Score update detected");
        }
      } catch (err) {
        console.error("Error parsing SSE data:", err);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      setTimeout(() => connectToSSE(), 5000);
    };

    return eventSource;
  }, [fetchMatches, addToast]);

  useEffect(() => {
    const eventSource = connectToSSE();
    return () => eventSource.close();
  }, [connectToSSE]);

  useEffect(() => {
    fetchMatches();
  }, [refreshKey, fetchMatches]);

  // --- Match Actions ---
  const performAction = async (matchId: number, action: string, payload: any = null) => {
    try {
      const method = action === "delete" ? "DELETE" : "PUT";
      const body = method === "PUT" ? JSON.stringify({ action, ...payload }) : undefined;

      const response = await fetch(`${backend_uri}/${match_api}?id=${matchId}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body,
      });
      const result = await response.json();

      if (result.status === "success") {
        addToast(`Match ${action} successful`);
        triggerRefresh();
      } else {
        addToast(`Error: ${result.message || "Failed to update match"}`);
      }
    } catch (err) {
      console.error(`Error performing ${action}:`, err);
      addToast(`Error performing ${action}`);
    }
  };

  // --- Local Strike Updater ---
  const handleStrikeUpdate = (fighterId: number, newStrikes: number) => {
    setMatches((prev) =>
      prev.map((m) => ({
        ...m,
        fighters: m.fighters.map((f) =>
          f.fighterId === fighterId ? { ...f, strikes: newStrikes } : f
        ),
      }))
    );
    onStrikeUpdate(fighterId, newStrikes);
  };

  const handleGrandTotalChange = (
    matchId: number,
    fighterId: number,
    grandTotal: string
  ) => {
    setFighterTotals((prev) => ({
      ...prev,
      [matchId]: {
        ...(prev[matchId] || {}),
        [fighterId]: grandTotal,
      },
    }));
  };

  // --- UI Helpers ---
  const toggleVisibility = (matchId: number) =>
    setVisibleMatches((prev) => ({ ...prev, [matchId]: !prev[matchId] }));

  const getHighlightClass = (f1: number, f2: number, isF1: boolean) => {
    if (f1 > f2 && f1 > 0 && isF1) return "winner";
    if (f2 > f1 && f2 > 0 && !isF1) return "winner";
    return "";
  };

  const getMatchTableClass = (status: "P" | "A" | "D" | undefined) => {
    if (status === "A") return "match-table active-match";
    if (status === "D") return "match-table completed-match";
    return "match-table pending-match";
  };

  // --- Render ---
  return (
    <div>
      {matches.length > 0 ? (
        matches.map((match) => {
          if (!match.fighters?.length) return null;
          const [f1, f2] = match.fighters;

          const f1Total = parseFloat(fighterTotals[match.matchId]?.[f1.fighterId] || "0.00");
          const f2Total = parseFloat(fighterTotals[match.matchId]?.[f2.fighterId] || "0.00");


          return (
            <div key={`match-${match.matchId}`} className={getMatchTableClass(match.PendingActiveDone)}>
              <div className="table-header">
                <div>
                  <span className={getHighlightClass(f1Total, f2Total, true)}>
                    ({f1Total.toFixed(2)})
                    <FighterDropdown
                      key={`dropdown-${f1.fighterId}`}
                      fighter={{
                        FighterId: f1.fighterId,
                        FighterName: f1.fighterName,
                        FighterColor: f1.fighterColor,
                        ClubAcronym: null,
                      }}
                      allFighters={fighters}
                      localFighters={[
                        {
                          FighterId: f2.fighterId,
                          FighterName: f2.fighterName,
                          FighterColor: f2.fighterColor,
                          ClubAcronym: null,
                        },
                      ]}
                      interactive={true}
                      onUpdate={(color, id) =>
                        performAction(match.matchId, "updateFighter", {
                          fighterId: id,
                          fighterColor: color,
                        })
                      }
                    />
                  </span>{" "}
                  vs.{" "}
                  <span className={getHighlightClass(f1Total, f2Total, false)}>
                    <FighterDropdown
                      key={`dropdown-${f2.fighterId}`}
                      fighter={{
                        FighterId: f2.fighterId,
                        FighterName: f2.fighterName,
                        FighterColor: f2.fighterColor,
                        ClubAcronym: null,
                      }}
                      allFighters={fighters}
                      localFighters={[
                        {
                          FighterId: f1.fighterId,
                          FighterName: f1.fighterName,
                          FighterColor: f1.fighterColor,
                          ClubAcronym: null,
                        },
                      ]}
                      interactive={true}
                      onUpdate={(color, id) =>
                        performAction(match.matchId, "updateFighter", {
                          fighterId: id,
                          fighterColor: color,
                        })
                      }
                    />{" "}
                    ({f2Total.toFixed(2)})
                  </span>
                </div>
                <button className="toggle-button" onClick={() => toggleVisibility(match.matchId)}>
                  {visibleMatches[match.matchId] ? "Close" : "Open"}
                </button>
              </div>

              {visibleMatches[match.matchId] && (
                <>
                  <div className="scoreTables">
                    <ScoreDisplayComponent
                      key={`score-${match.matchId}-${f1.fighterId}`}
                      fighter={f1}
                      tournamentId={tournamentId}
                      onStrikeUpdate={handleStrikeUpdate}
                      onGrandTotalChange={(fighterId, grandTotal) =>
                        handleGrandTotalChange(match.matchId, fighterId, grandTotal)
                      }
                      isWinner={f1Total > f2Total && f1Total > 0}
                    />

                    <ScoreDisplayComponent
                      key={`score-${match.matchId}-${f2.fighterId}`}
                      fighter={f2}
                      tournamentId={tournamentId}
                      onStrikeUpdate={handleStrikeUpdate}
                      onGrandTotalChange={(fighterId, grandTotal) =>
                        handleGrandTotalChange(match.matchId, fighterId, grandTotal)
                      }
                      isWinner={f2Total > f1Total && f2Total > 0}
                    />
                  </div>

                  <TriggerJudgement
                    key={`trigger1-${match.matchId}`}
                    matchId={match.matchId}
                    refresh={false}
                    onActivate={() => performAction(match.matchId, "activate")}
                    isActive={match.PendingActiveDone === "A"}
                  />
                  <TriggerJudgement
                    key={`trigger2-${match.matchId}`}
                    matchId={match.matchId}
                    refresh={true}
                    onActivate={() => performAction(match.matchId, "activate")}
                    isActive={match.PendingActiveDone === "A"}
                  />

                  <div style={{ textAlign: "center", marginTop: "10px" }}>
                    <MatchActions
                      key={`actions-${match.matchId}`}
                      localStatus={match.PendingActiveDone || "P"}
                      onSwap={() => performAction(match.matchId, "swap")}
                      onComplete={() => performAction(match.matchId, "complete")}
                      onPending={() => performAction(match.matchId, "pending")}
                      onDelete={() => performAction(match.matchId, "delete")}
                    />
                  </div>
                </>
              )}
            </div>
          );
        })
      ) : (
        <div>
          No matches available.{" "}
          <a href={`/manager/matching/${tournamentId}`}>Click here to create matches</a>
        </div>
      )}
    </div>
  );
};

export default MatchTables;

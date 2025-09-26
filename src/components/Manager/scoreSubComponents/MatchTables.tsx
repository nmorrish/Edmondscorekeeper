/**
 * src/components/Manager/subComponents/MatchTables.tsx
 *
 * === Match Tables ===
 * Displays matches for the selected Event + Ring.
 * Normalizes backend shape into the frontend’s expected Match/Bout/Fighter structure.
 */

import React, { useState, useEffect, useCallback } from "react";
import TriggerJudgement from "./TriggerJudgement";
import MatchActions from "../matchSubComponents/matchActions";
import { useRefresh } from "../../utility/RefreshContext";
import { backend_uri, match_api } from "../../utility/endpoints";
import ScoreDisplayComponent from "./ScoreDisplayComponent";
import FighterDropdown from "../matchSubComponents/fighterDropdown";
import { useToast } from "../../utility/ToastProvider";
import debounce from "lodash/debounce";
import { Fighter } from "../subComponents/useFighters";

interface Score {
  scoreId: number;
  target: number;
  contact: number;
  control: number;
  afterBlow: number;
  opponentSelfCall: number;
  doubleHit: boolean;
}

interface Bout {
  boutId: number;
  fighter1: {
    fighterColor: string;
    fighterName: string;
    fighterId: number;
    Scores: Score[];
    strikes: number;
  };
  fighter2: {
    fighterColor: string;
    fighterName: string;
    fighterId: number;
    Scores: Score[];
    strikes: number;
  };
}

interface Match {
  matchId: number;
  matchRing: number;
  Bouts: Bout[];
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
  const [fighter1GrandTotals, setFighter1GrandTotals] = useState<Record<number, string>>({});
  const [fighter2GrandTotals, setFighter2GrandTotals] = useState<Record<number, string>>({});
  const { refreshKey, triggerRefresh } = useRefresh();
  const addToast = useToast();

  // --- Fetch Matches ---
  const fetchMatches = useCallback(
    debounce(async () => {
      if (!eventId || !tournamentId || !ringNumber) return;

      try {
        const response = await fetch(
          `${backend_uri}/${match_api}?tournamentId=${tournamentId}&eventId=${eventId}&matchRing=${ringNumber}`
        );
        const data = await response.json();

        if (data?.status === "success" && Array.isArray(data.matches)) {
          const normalized: Match[] = data.matches.map((m: any) => {
            const [f1, f2] = m.fighters || [];
            return {
              matchId: m.MatchId,
              matchRing: m.MatchRingNo,
              Active: m.PendingActiveDone === "A",
              matchComplete: m.PendingActiveDone === "D",
              PendingActiveDone: m.PendingActiveDone,
              Bouts: [
                {
                  boutId: m.MatchId,
                  fighter1: {
                    fighterId: f1?.FighterId || 0,
                    fighterName: f1?.FighterName || "",
                    fighterColor: f1?.FighterColor || "Red",
                    Scores: f1?.Scores || [],
                    strikes: f1?.Strikes ?? 0,
                  },
                  fighter2: {
                    fighterId: f2?.FighterId || 0,
                    fighterName: f2?.FighterName || "",
                    fighterColor: f2?.FighterColor || "Blue",
                    Scores: f2?.Scores || [],
                    strikes: f2?.Strikes ?? 0,
                  },
                },
              ],
            };
          });
          setMatches(normalized);
        } else {
          setMatches([]);
        }
      } catch (error) {
        console.error("Error fetching matches:", error);
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
      } catch (error) {
        console.error("Error parsing SSE data:", error);
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

  // --- Match Actions + Fighter Updates ---
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

        // Optimistically update local UI state
        setMatches((prev) =>
          prev.map((m) => {
            if (m.matchId !== matchId) {
              // If another match goes active, flip same-ring actives to done
              if (action === "activate" && m.matchRing === ringNumber && m.PendingActiveDone === "A") {
                return { ...m, PendingActiveDone: "D", Active: false, matchComplete: true };
              }
              return m;
            }

            // Update this match
            if (action === "activate")
              return { ...m, PendingActiveDone: "A", Active: true, matchComplete: false };
            if (action === "complete")
              return { ...m, PendingActiveDone: "D", Active: false, matchComplete: true };
            if (action === "pending")
              return { ...m, PendingActiveDone: "P", Active: false, matchComplete: false };

            return m;
          })
        );

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
      prev.map((match) => ({
        ...match,
        Bouts: match.Bouts.map((bout) => ({
          ...bout,
          fighter1:
            bout.fighter1.fighterId === fighterId
              ? { ...bout.fighter1, strikes: newStrikes }
              : bout.fighter1,
          fighter2:
            bout.fighter2.fighterId === fighterId
              ? { ...bout.fighter2, strikes: newStrikes }
              : bout.fighter2,
        })),
      }))
    );
    onStrikeUpdate(fighterId, newStrikes);
  };

  // --- UI Helpers ---
  const toggleVisibility = (matchId: number) =>
    setVisibleMatches((prev) => ({ ...prev, [matchId]: !prev[matchId] }));

  const getHighlightClass = (f1: number, f2: number, isF1: boolean) =>
    f1 > f2 && f1 > 0 && isF1 ? "highlight" : f2 > f1 && f2 > 0 && !isF1 ? "highlight" : "";

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
          if (!match.Bouts?.length) return null;

          const f1 = match.Bouts[0].fighter1;
          const f2 = match.Bouts[0].fighter2;

          const f1Total = parseFloat(fighter1GrandTotals[match.matchId] || "0.00");
          const f2Total = parseFloat(fighter2GrandTotals[match.matchId] || "0.00");

          return (
            <div key={match.matchId} className={getMatchTableClass(match.PendingActiveDone)}>
              <div className="table-header">
                <div>
                  <span className={getHighlightClass(f1Total, f2Total, true)}>
                    ({f1Total.toFixed(2)})
                    <FighterDropdown
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
                      fighter={{
                        ...f1,
                        Bouts: match.Bouts.map((b) => b.fighter1.Scores),
                      }}
                      tournamentId={tournamentId}
                      onStrikeUpdate={handleStrikeUpdate}
                    />

                    <ScoreDisplayComponent
                      fighter={{
                        ...f2,
                        Bouts: match.Bouts.map((b) => b.fighter2.Scores),
                      }}
                      tournamentId={tournamentId}
                      onStrikeUpdate={handleStrikeUpdate}
                    />
                  </div>

                  <TriggerJudgement
                    matchId={match.matchId}
                    refresh={false}
                    onActivate={() => performAction(match.matchId, "activate")}
                    isActive={match.PendingActiveDone === "A"}
                  />
                  <TriggerJudgement
                    matchId={match.matchId}
                    refresh={true}
                    onActivate={() => performAction(match.matchId, "activate")}
                    isActive={match.PendingActiveDone === "A"}
                  />

                  <div style={{ textAlign: "center", marginTop: "10px" }}>
                    <MatchActions
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
          No matches available. <a href={`/manager/matching/${tournamentId}`}>Click here to create matches</a>
        </div>
      )}
    </div>
  );
};

export default MatchTables;

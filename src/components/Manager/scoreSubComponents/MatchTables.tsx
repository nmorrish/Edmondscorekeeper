/**
 * src/components/Manager/scoreSubComponents/MatchTables.tsx
 *
 * === Match Tables ===
 * Displays matches for the selected Event + Ring.
 * Uses scoresApi.php (not matchesApi.php) for metadata and scores.
 * Always pulls scores to ensure judges are synced after crashes/reconnects.
 */

import React, { useState, useEffect, useCallback } from "react";
import TriggerJudgement from "./TriggerJudgement";
import MatchActions from "../matchSubComponents/matchActions";
import { useRefresh } from "../../utility/RefreshContext";
import { backend_uri, match_api, score_api } from "../../utility/endpoints";
import ScoreDisplayComponent from "./ScoreDisplayComponent";
import FighterDropdown from "../matchSubComponents/fighterDropdown";
import RingDropdown from "../matchSubComponents/ringDropdown";
import { useToast } from "../../utility/ToastProvider";
import debounce from "lodash/debounce";
import { Fighter } from "../subComponents/useFighters";
import { apiQuery } from "../../utility/apiClient";
import ExchangeReviewModal from "./ExchangeReviewModal";

// --- Types ---
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
  contactUncertainty: boolean;
  targetUncertainty: boolean;
  controlUncertainty: boolean;
  doubleHitUncertainty: boolean;
  afterBlowUncertainty: boolean;
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
  finalScore: number;
  winLossDraw?: string | null;
  exchanges: Exchange[];
}

export interface Match {
  matchId: number;
  matchRing: number;
  fighters: FighterWithExchanges[];
  Active: boolean;
  matchComplete: boolean;
  pendingActiveDone?: "P" | "A" | "D";
  poolNo?: number | null;
}

interface MatchTablesProps {
  ringNumber: number;
  eventId: number;
  tournamentId: number;
  fighters: Fighter[];
  maxRings: number;
  onStrikeUpdate: (fighterId: number, newStrikes: number) => void;
  readOnly: boolean;
}

const MatchTables: React.FC<MatchTablesProps> = ({
  ringNumber,
  eventId,
  tournamentId,
  fighters,
  maxRings,
  onStrikeUpdate,
  readOnly,
}) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [visibleMatches, setVisibleMatches] = useState<Record<number, boolean>>({});
  const [openJudgeDrilldown, setOpenJudgeDrilldown] = useState<Record<number, boolean>>({});
  const [fighterTotals, setFighterTotals] = useState<Record<number, Record<number, string>>>({});
  const [reviewMatchId, setReviewMatchId] = useState<number | null>(null);
  const [reviewState, setReviewState] = useState<Record<number, { exchangeIndex: number; camIndex: number }>>({});
  const { refreshKey, triggerRefresh } = useRefresh();
  const addToast = useToast();

  // --- Fetch Matches + Scores ---
  const fetchMatches = useCallback(
    debounce(async () => {
      if (!eventId || !tournamentId || !ringNumber) return;

      try {
        const resp = await apiQuery(
          `${backend_uri}/${score_api}?eventId=${eventId}&ringNo=${ringNumber}`
        );
        const baseData = await resp.json();

        if (baseData?.status === "success" && Array.isArray(baseData.matches)) {
          const scoredMatches: Match[] = baseData.matches.map((sm: any) => ({
            matchId: sm.matchId,
            matchRing: sm.matchRing,
            poolNo: sm.poolNo ?? null,
            Active: sm.pendingActiveDone === "A",
            matchComplete: sm.pendingActiveDone === "D",
            pendingActiveDone: sm.pendingActiveDone,
            fighters: (sm.fighters || []).map((f: any) => ({
              fighterId: f.fighterId,
              fighterName: f.fighterName,
              fighterColor: f.fighterColor,
              strikes: f.strikes ?? 0,
              finalScore: f.finalScore != null ? Number(f.finalScore) : 0,
              winLossDraw: f.winLossDraw ?? null,
              exchanges: (f.exchanges || []).map((ex: any) => ({
                exchangeId: ex.exchangeId ?? ex.ExchangeId,
                exchangeTimeStamp: ex.exchangeTimeStamp ?? ex.ExchangeTimeStamp,
                scores: ex.scores || [],
              })),
            })),
          }));

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

  // --- SSE ---
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
    if (readOnly) return;
    const eventSource = connectToSSE();
    return () => eventSource.close();
  }, [connectToSSE, readOnly]);

  useEffect(() => {
    fetchMatches();
  }, [refreshKey, fetchMatches]);

  // --- Match Actions ---
  const performAction = async (matchId: number, action: string, payload: any = null) => {
    try {
      const method = action === "delete" ? "DELETE" : "PUT";
      const body = method === "PUT" ? JSON.stringify({ action, ...payload }) : undefined;

      const response = await apiQuery(`${backend_uri}/${match_api}?id=${matchId}`, {
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

  // --- Strike Update ---
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

  const handleGrandTotalChange = (matchId: number, fighterId: number, grandTotal: string) => {
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

  const toggleJudgeDrilldown = (matchId: number) =>
    setOpenJudgeDrilldown((prev) => ({ ...prev, [matchId]: !prev[matchId] }));

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

  const handleChangeRing = (matchId: number, newRing: number) => {
    setMatches((prev) =>
      prev.map((m) =>
        m.matchId === matchId ? { ...m, matchRing: newRing } : m
      )
    );
    triggerRefresh();
  };

  const handleReviewClose = (matchId: number, exchangeIndex: number, camIndex: number) => {
    setReviewState((prev) => ({ ...prev, [matchId]: { exchangeIndex, camIndex } }));
    setReviewMatchId(null);
  };

  // --- Group by pool ---
  const groupByPool = (matches: Match[]) => {
    const grouped: Record<string, Match[]> = {};
    matches.forEach((m) => {
      const key = m.poolNo != null ? `Pool ${m.poolNo}` : "No Pool";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });
    return grouped;
  };

  // --- Shared match body renderer ---
  const renderMatchBody = (match: Match, f1: FighterWithExchanges, f2: FighterWithExchanges) => {
    const f1Total = parseFloat(
      fighterTotals[match.matchId]?.[f1.fighterId] ?? f1.finalScore.toString()
    );
    const f2Total = parseFloat(
      fighterTotals[match.matchId]?.[f2.fighterId] ?? f2.finalScore.toString()
    );
    const hasExchanges = Math.max(f1.exchanges.length, f2.exchanges.length) > 0;
    const showVideo =
      (match.pendingActiveDone === "A" || match.pendingActiveDone === "D") && hasExchanges;

    return (
      <>
        <div className="scoreTables">
          <ScoreDisplayComponent
            key={`score-${match.matchId}-${f1.fighterId}`}
            fighter={f1}
            tournamentId={tournamentId}
            onStrikeUpdate={readOnly ? () => {} : handleStrikeUpdate}
            onGrandTotalChange={(fighterId, grandTotal) =>
              handleGrandTotalChange(match.matchId, fighterId, grandTotal)
            }
            isWinner={f1Total > f2Total && f1Total > 0}
            showJudgeDrilldown={!!openJudgeDrilldown[match.matchId]}
            readOnly={readOnly}
            matchStatus={match.pendingActiveDone}
          />
          <ScoreDisplayComponent
            key={`score-${match.matchId}-${f2.fighterId}`}
            fighter={f2}
            tournamentId={tournamentId}
            onStrikeUpdate={readOnly ? () => {} : handleStrikeUpdate}
            onGrandTotalChange={(fighterId, grandTotal) =>
              handleGrandTotalChange(match.matchId, fighterId, grandTotal)
            }
            isWinner={f2Total > f1Total && f2Total > 0}
            showJudgeDrilldown={!!openJudgeDrilldown[match.matchId]}
            readOnly={readOnly}
            matchStatus={match.pendingActiveDone}
          />
        </div>

        {!readOnly && (
          <>
            <TriggerJudgement
              key={`trigger1-${match.matchId}`}
              matchId={match.matchId}
              refresh={false}
              onActivate={() => performAction(match.matchId, "activate")}
              isActive={match.pendingActiveDone === "A"}
            />
            <TriggerJudgement
              key={`trigger2-${match.matchId}`}
              matchId={match.matchId}
              refresh={true}
              onActivate={() => performAction(match.matchId, "activate")}
              isActive={match.pendingActiveDone === "A"}
            />
          </>
        )}

        {visibleMatches[match.matchId] && (
          <button
            className="toggle-drilldown"
            onClick={() => toggleJudgeDrilldown(match.matchId)}
          >
            {openJudgeDrilldown[match.matchId] ? "Close Score List" : "Open Score List"}
          </button>
        )}
        <br />

        {showVideo && (
          <button
            className="toggle-drilldown"
            onClick={() => setReviewMatchId(match.matchId)}
          >
            &#9654; Video Review
          </button>
        )}

        {!readOnly && (
          <div style={{ textAlign: "center", marginTop: "10px" }}>
            <MatchActions
              key={`actions-${match.matchId}`}
              localStatus={match.pendingActiveDone || "P"}
              onSwap={() => performAction(match.matchId, "swap")}
              onComplete={() => performAction(match.matchId, "complete")}
              onPending={() => performAction(match.matchId, "pending")}
              onDelete={() => performAction(match.matchId, "delete")}
            />
          </div>
        )}
      </>
    );
  };

  // --- Shared match header renderer ---
  const renderMatchHeader = (match: Match, f1: FighterWithExchanges, f2: FighterWithExchanges, matchNumber: number) => {
    const f1Total = parseFloat(
      fighterTotals[match.matchId]?.[f1.fighterId] ?? f1.finalScore.toString()
    );
    const f2Total = parseFloat(
      fighterTotals[match.matchId]?.[f2.fighterId] ?? f2.finalScore.toString()
    );

    return (
      <div
        className="table-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontWeight: "bold", color: "#aaa", whiteSpace: "nowrap", fontSize: "0.85rem" }}>
            Match {matchNumber}
          </span>
          <span
            className={`${getHighlightClass(f1Total, f2Total, true)} ${f1.fighterColor}`}
            style={{ padding: "2px 8px", borderRadius: "4px" }}
          >
            ({f1Total.toFixed(2)})
            {readOnly ? (
              <span>{f1.fighterName}</span>
            ) : (
              <FighterDropdown
                key={`dropdown-${f1.fighterId}`}
                fighter={{
                  FighterId: f1.fighterId,
                  FighterName: f1.fighterName,
                  FighterColor: f1.fighterColor,
                  ClubAcronym: null,
                }}
                allFighters={fighters}
                localFighters={[{
                  FighterId: f2.fighterId,
                  FighterName: f2.fighterName,
                  FighterColor: f2.fighterColor,
                  ClubAcronym: null,
                }]}
                interactive={true}
                onUpdate={(color, id) =>
                  performAction(match.matchId, "updateFighter", { fighterId: id, fighterColor: color })
                }
              />
            )}
          </span>
          {" "}vs.{" "}
          <span
            className={`${getHighlightClass(f1Total, f2Total, false)} ${f2.fighterColor}`}
            style={{ padding: "2px 8px", borderRadius: "4px" }}
          >
            {readOnly ? (
              <span>{f2.fighterName}</span>
            ) : (
              <FighterDropdown
                key={`dropdown-${f2.fighterId}`}
                fighter={{
                  FighterId: f2.fighterId,
                  FighterName: f2.fighterName,
                  FighterColor: f2.fighterColor,
                  ClubAcronym: null,
                }}
                allFighters={fighters}
                localFighters={[{
                  FighterId: f1.fighterId,
                  FighterName: f1.fighterName,
                  FighterColor: f1.fighterColor,
                  ClubAcronym: null,
                }]}
                interactive={true}
                onUpdate={(color, id) =>
                  performAction(match.matchId, "updateFighter", { fighterId: id, fighterColor: color })
                }
              />
            )}{" "}
            ({f2Total.toFixed(2)})
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {!readOnly && (
            <RingDropdown
              matchId={match.matchId}
              currentRing={match.matchRing}
              maxRings={maxRings}
              interactive={true}
              onChangeRing={(id, newRing) => {
                handleChangeRing(id, newRing);
                addToast(`Match ${id} moved to Ring ${newRing}`);
              }}
            />
          )}
          <button
            className="toggle-button"
            onClick={() => toggleVisibility(match.matchId)}
          >
            {visibleMatches[match.matchId] ? "Close" : "Open"}
          </button>
        </div>
      </div>
    );
  };

  // --- Render ---
  const poolsExist = matches.some((m) => m.poolNo != null);

  const matchOrder = poolsExist
    ? (() => {
        const grouped = groupByPool(matches);
        const sortedKeys = Object.keys(grouped).sort((a, b) => {
          if (a === "No Pool") return 1;
          if (b === "No Pool") return -1;
          return parseInt(a.replace("Pool ", ""), 10) - parseInt(b.replace("Pool ", ""), 10);
        });
        return sortedKeys.flatMap((k) => grouped[k].map((m) => m.matchId));
      })()
    : matches.map((m) => m.matchId);

  return (
    <div>
      {matches.length > 0 ? (
        poolsExist ? (() => {
          const grouped = groupByPool(matches);
          const sortedKeys = Object.keys(grouped).sort((a, b) => {
            if (a === "No Pool") return 1;
            if (b === "No Pool") return -1;
            return parseInt(a.replace("Pool ", ""), 10) - parseInt(b.replace("Pool ", ""), 10);
          });

          return sortedKeys.map((poolKey, idx) => {
            const poolMatches = grouped[poolKey];
            return (
              <div
                key={poolKey}
                style={{
                  padding: "1rem",
                  marginBottom: "1rem",
                  borderRadius: "8px",
                  backgroundColor: idx % 2 === 0 ? "rgb(0,0,20)" : "rgb(20,0,0)",
                }}
              >
                {poolKey !== "No Pool" && (
                  <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "0.75rem", textAlign: "center" }}>
                    {poolKey}
                  </h2>
                )}

                {poolMatches.map((match) => {
                  if (!match.fighters || match.fighters.length < 2) return null;
                  const [f1, f2] = match.fighters;

                  return (
                    <div key={`match-${match.matchId}`} className={getMatchTableClass(match.pendingActiveDone)}>
                      {renderMatchHeader(match, f1, f2, matchOrder.indexOf(match.matchId) + 1)}
                      {match.poolNo && (
                        <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#fff", padding: "2px 6px", borderRadius: "4px" }}>
                          Pool {match.poolNo}
                        </div>
                      )}
                      {visibleMatches[match.matchId] && renderMatchBody(match, f1, f2)}
                    </div>
                  );
                })}
              </div>
            );
          });
        })() : (
          matches.map((match) => {
            if (!match.fighters || match.fighters.length < 2) return null;
            const [f1, f2] = match.fighters;

            return (
              <div key={`match-${match.matchId}`} className={getMatchTableClass(match.pendingActiveDone)}>
                {renderMatchHeader(match, f1, f2, matchOrder.indexOf(match.matchId) + 1)}
                {visibleMatches[match.matchId] && renderMatchBody(match, f1, f2)}
              </div>
            );
          })
        )
      ) : (
        <div>
          No matches available.{" "}
          <a href={`/manager/matching/${tournamentId}`}>Click here to create matches</a>
        </div>
      )}

      {/* Video review modal */}
      {reviewMatchId && (() => {
        const m = matches.find((x) => x.matchId === reviewMatchId);
        if (!m || m.fighters.length < 2) return null;
        const [f1, f2] = m.fighters;
        if (!f1.exchanges.length && !f2.exchanges.length) return null;
        const saved = reviewState[reviewMatchId];
        return (
          <ExchangeReviewModal
            fighter1={{
              fighterId: f1.fighterId,
              fighterName: f1.fighterName,
              fighterColor: f1.fighterColor,
              exchanges: f1.exchanges,
            }}
            fighter2={{
              fighterId: f2.fighterId,
              fighterName: f2.fighterName,
              fighterColor: f2.fighterColor,
              exchanges: f2.exchanges,
            }}
            initialExchangeIndex={saved?.exchangeIndex ?? 0}
            initialCamIndex={saved?.camIndex ?? 0}
            readOnly={readOnly}
            onClose={(exchangeIndex, camIndex) => handleReviewClose(reviewMatchId, exchangeIndex, camIndex)}
          />
        );
      })()}
    </div>
  );
};

export default MatchTables;
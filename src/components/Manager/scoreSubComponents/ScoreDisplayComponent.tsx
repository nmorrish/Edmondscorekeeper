/**
 * src/components/Manager/scoreSubComponents/ScoreDisplayComponent.tsx
 *
 * === Score Display Component ===
 * Shows per-exchange averages (one row per exchange), column totals, and grand total.
 * When toggled into JudgeScores mode, hides the main headers so only
 * the JudgeScores per-exchange tables (with their own headers) are visible.
 *
 * Below each exchange row (Active or Done matches), drops in a fully
 * self-contained ExchangeVideoButtons component for per-camera footage.
 */

import React, { useState, useEffect } from "react";
import TotalsCalculator, { Fighter, Exchange } from "../../utility/TotalsCalculator";
import IncrementFighterStrikeButton from "../fighterSubComponents/incrementFighterStrikes";
import JudgeScores from "./JudgeScores";

type LooseExchange = {
  exchangeId?: number;
  ExchangeId?: number;
  exchangeTimeStamp?: string | null;
  scores: Exchange["scores"];
};

interface ScoreDisplayComponentProps {
  fighter: Fighter & { strikes: number };
  tournamentId: number;
  onStrikeUpdate: (fighterId: number, newStrikes: number) => void;
  onGrandTotalChange?: (fighterId: number, grandTotal: string) => void;
  isWinner?: boolean;
  showJudgeDrilldown?: boolean;
  onToggleView?: (mode: "averages" | "judges") => void;
  readOnly: boolean;
  matchStatus?: "P" | "A" | "D";
}

const ScoreDisplayComponent: React.FC<ScoreDisplayComponentProps> = ({
  fighter,
  tournamentId,
  onStrikeUpdate,
  onGrandTotalChange,
  isWinner = false,
  showJudgeDrilldown = false,
  readOnly,
  matchStatus,
}) => {
  const [localExchanges, setLocalExchanges] = useState<Exchange[]>([]);
  const [totals, setTotals] = useState<any>(null);

  useEffect(() => {
    setLocalExchanges(
      (fighter.exchanges || []).map((ex, idx) => ({
        exchangeId: ex.exchangeId ?? (ex as any).ExchangeId ?? idx,
        exchangeTimeStamp: ex.exchangeTimeStamp ?? "",
        scores: ex.scores || [],
      }))
    );
  }, [fighter.exchanges]);

  const handleTotalsCalculated = (t: any) => {
    setTotals(t);
    if (onGrandTotalChange) {
      onGrandTotalChange(fighter.fighterId, t.grandTotal);
    }
  };

  return (
    <div style={{ marginTop: "15px" }}>
      <TotalsCalculator
        fighter={{ ...fighter, exchanges: localExchanges }}
        onTotalsCalculated={handleTotalsCalculated}
      />
      <table className="match">
        <thead>
          <tr>
            <th colSpan={7} className={`${fighter.fighterColor} ${isWinner ? "winner" : ""}`}>
              {fighter.fighterName} ({fighter.fighterColor})
              {!readOnly && (
                <IncrementFighterStrikeButton
                  fighterId={fighter.fighterId}
                  tournamentId={tournamentId}
                  initialStrikes={fighter.strikes ?? 0}
                  onStrikeUpdate={onStrikeUpdate}
                />
              )}
            </th>
          </tr>
          {!showJudgeDrilldown && (
            <tr>
              <th>Judges</th>
              <th>Contact</th>
              <th>Target</th>
              <th>Control</th>
              <th>A/B</th>
              <th>Call</th>
              <th>Doubles</th>
            </tr>
          )}
        </thead>
        <tbody>
          {readOnly && matchStatus === "A" ? (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", fontStyle: "italic" }}>
                Match in progress
              </td>
            </tr>
          ) : (
            <>
              {!showJudgeDrilldown &&
                (totals?.exchangeAverages || []).map((row: any, idx: number) => {
                  const exchangeId = localExchanges[idx]?.exchangeId;
                  return (
                    <tr key={`fighter-${fighter.fighterId}-exchange-${idx}`}>
                      <td>{row.judgeCount}</td>
                      <td>{row.avgContact.toFixed(1)}</td>
                      <td>{row.avgTarget.toFixed(1)}</td>
                      <td>{row.avgControl.toFixed(1)}</td>
                      <td>{row.avgAfterBlow.toFixed(1)}</td>
                      <td>{row.avgSelfCall.toFixed(1)}</td>
                      <td>{row.avgDoubleHit.toFixed(1)}</td>
                    </tr>
                  );
                })}

              {showJudgeDrilldown && (
                <tr>
                  <td colSpan={7}>
                    <JudgeScores
                      fighterId={fighter.fighterId}
                      exchanges={localExchanges}
                      readOnly={readOnly}
                      onExchangesUpdate={(updated: LooseExchange[]) =>
                        setLocalExchanges(
                          (updated || []).map((ex, idx) => ({
                            exchangeId: ex.exchangeId ?? ex.ExchangeId ?? idx,
                            exchangeTimeStamp: ex.exchangeTimeStamp ?? "",
                            scores: ex.scores || [],
                          }))
                        )
                      }
                    />
                  </td>
                </tr>
              )}

              {totals && (
                <>
                  <tr className="subtotal-row">
                    <td>Totals</td>
                    <td>{totals.overallTotals.contact.toFixed(1)}</td>
                    <td>{totals.overallTotals.target.toFixed(1)}</td>
                    <td>{totals.overallTotals.control.toFixed(1)}</td>
                    <td>{totals.overallTotals.afterBlow.toFixed(1)}</td>
                    <td>{totals.overallTotals.opponentSelfCall.toFixed(1)}</td>
                    <td>({totals.overallTotals.doubleHit.toFixed(1)})</td>
                  </tr>
                  <tr>
                    <td colSpan={7} className={isWinner ? "winner" : ""}>
                      Grand Total: {totals.grandTotal}
                    </td>
                  </tr>
                </>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};

const videoCellStyle: React.CSSProperties = {
  padding: "6px 8px",
  background: "#1a1a1a08",
  textAlign: "left",
};

export default React.memo(ScoreDisplayComponent);
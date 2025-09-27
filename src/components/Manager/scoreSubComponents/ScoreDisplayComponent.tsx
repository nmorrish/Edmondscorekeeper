/**
 * src/components/Manager/subComponents/ScoreDisplayComponent.tsx
 *
 * === Score Display Component ===
 * Shows per-exchange averages (one row per exchange), column totals, and grand total.
 * "Judges" = count of ExchangeScores for that exchange (one entry per judge).
 */

import React, { useState } from "react";
import TotalsCalculator, { Fighter } from "../../utility/TotalsCalculator";
import IncrementFighterStrikeButton from "../fighterSubComponents/incrementFighterStrikes";

interface ScoreDisplayComponentProps {
  fighter: Fighter & { strikes: number };
  tournamentId: number;
  onStrikeUpdate: (fighterId: number, newStrikes: number) => void;
  onGrandTotalChange?: (fighterId: number, grandTotal: string) => void;
  isWinner?: boolean; // added prop
}

const ScoreDisplayComponent: React.FC<ScoreDisplayComponentProps> = ({
  fighter,
  tournamentId,
  onStrikeUpdate,
  onGrandTotalChange,
  isWinner = false,
}) => {
  const [totals, setTotals] = useState<{
    exchangeAverages: Array<{
      judgeCount: number;
      avgContact: number;
      avgTarget: number;
      avgControl: number;
      avgAfterBlow: number;
      avgSelfCall: number;
      avgDoubleHit: number;
    }>;
    overallTotals: {
      contact: number;
      target: number;
      control: number;
      afterBlow: number;
      opponentSelfCall: number;
      doubleHit: number;
    };
    grandTotal: string;
  } | null>(null);

  const handleTotalsCalculated = (t: NonNullable<typeof totals>) => {
    setTotals(t);
    if (onGrandTotalChange) {
      onGrandTotalChange(fighter.fighterId, t.grandTotal);
    }
  };

  return (
    <div>
      <TotalsCalculator fighter={fighter} onTotalsCalculated={handleTotalsCalculated} />

      <table className="match">
        <thead>
          <tr>
            <th colSpan={7} className={`${fighter.fighterColor} ${isWinner ? "winner" : ""}`}>
              {fighter.fighterName} ({fighter.fighterColor})
              <IncrementFighterStrikeButton
                fighterId={fighter.fighterId}
                tournamentId={tournamentId}
                initialStrikes={fighter.strikes ?? 0}
                onStrikeUpdate={onStrikeUpdate}
              />
            </th>
          </tr>
          <tr>
            <th>Judges</th>
            <th>Contact</th>
            <th>Target</th>
            <th>Control</th>
            <th>A/B</th>
            <th>Call</th>
            <th>Doubles</th>
          </tr>
        </thead>
        <tbody>
          {(totals?.exchangeAverages || []).map((row, idx) => (
            <tr key={`fighter-${fighter.fighterId}-exchange-${idx}`}>
              <td>{row.judgeCount}</td>
              <td>{row.avgContact.toFixed(1)}</td>
              <td>{row.avgTarget.toFixed(1)}</td>
              <td>{row.avgControl.toFixed(1)}</td>
              <td>{row.avgAfterBlow.toFixed(1)}</td>
              <td>{row.avgSelfCall.toFixed(1)}</td>
              <td>{row.avgDoubleHit.toFixed(1)}</td>
            </tr>
          ))}

          {totals && (
            <>
              <tr className="subtotal-row">
                <td>Totals</td>
                <td>{totals.overallTotals.contact.toFixed(1)}</td>
                <td>{totals.overallTotals.target.toFixed(1)}</td>
                <td>{totals.overallTotals.control.toFixed(1)}</td>
                <td>{totals.overallTotals.afterBlow.toFixed(1)}</td>
                <td>{totals.overallTotals.opponentSelfCall.toFixed(1)}</td>
                <td>{totals.overallTotals.doubleHit.toFixed(1)}</td>
              </tr>
              <tr>
                <td colSpan={7} className={isWinner ? "winner" : ""}>
                  Grand Total: {totals.grandTotal}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default React.memo(ScoreDisplayComponent);

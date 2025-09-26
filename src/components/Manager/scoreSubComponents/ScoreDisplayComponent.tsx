/**
 * src/components/Manager/subComponents/ScoreDisplayComponent.tsx
 *
 * === Score Display Component ===
 * Shows per-bout averages and totals for a fighter, plus strike increment button.
 */

import React, { useState } from "react";
import TotalsCalculator from "../../utility/TotalsCalculator";
import IncrementFighterStrikeButton from "../fighterSubComponents/incrementFighterStrikes";

interface Score {
  scoreId: number;
  target: number;
  contact: number;
  control: number;
  afterBlow: number;
  opponentSelfCall: number;
  doubleHit: boolean;
}

interface Fighter {
  fighterColor: string;
  fighterName: string;
  fighterId: number;
  Bouts: Score[][];
  strikes: number; // local field for score display
}

interface ScoreDisplayComponentProps {
  fighter: Fighter;
  tournamentId: number;
  onStrikeUpdate: (fighterId: number, newStrikes: number) => void;
}

const ScoreDisplayComponent: React.FC<ScoreDisplayComponentProps> = ({
  fighter,
  tournamentId,
  onStrikeUpdate,
}) => {
  const [totals, setTotals] = useState<{
    boutTotals: any[];
    overallTotals: any;
    grandTotal: string;
  } | null>(null);

  const handleTotalsCalculated = (totals: {
    boutTotals: any[];
    overallTotals: any;
    grandTotal: string;
  }) => {
    setTotals(totals);
  };

  return (
    <div>
      {/* Calculate totals */}
      <TotalsCalculator fighter={fighter} onTotalsCalculated={handleTotalsCalculated} />

      <table className="match">
        <thead>
          <tr>
            <th colSpan={7} className={fighter.fighterColor}>
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
          {fighter.Bouts.map((_, index) => {
            const boutAverages = totals?.boutTotals?.[index] || {};
            return (
              <tr key={index}>
                <td>{boutAverages.judgeCount || 0}</td>
                <td>{boutAverages.avgContact?.toFixed(1) || "0.00"}</td>
                <td>{boutAverages.avgTarget?.toFixed(1) || "0.00"}</td>
                <td>{boutAverages.avgControl?.toFixed(1) || "0.00"}</td>
                <td>{boutAverages.avgAfterBlow?.toFixed(1) || "0.00"}</td>
                <td>{boutAverages.avgSelfCall?.toFixed(1) || "0.00"}</td>
                <td>{boutAverages.avgDoubleHit?.toFixed(1) || "0.00"}</td>
              </tr>
            );
          })}
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
                <td colSpan={7}>Grand Total: {totals.grandTotal}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default React.memo(ScoreDisplayComponent);

import React, { useState } from 'react';
import TotalsCalculator from '../../utility/TotalsCalculator';
import IncrementFighterStrikeButton from './incrementFighterStrikes'; // Assuming you use this button for strikes

// Define the Score interface
interface Score {
  scoreId: number;
  target: number;
  contact: number;
  control: number;
  afterBlow: number;
  opponentSelfCall: number;
  doubleHit: boolean;
}

// Define the Fighter interface
interface Fighter {
  fighterColor: string;
  fighterName: string;
  fighterId: number;
  Bouts: Score[][];
}

// Define the props interface for ScoreDisplayComponent
interface ScoreDisplayComponentProps {
  fighter: Fighter;
}

const ScoreDisplayComponent: React.FC<ScoreDisplayComponentProps> = ({ fighter }) => {
  const [totals, setTotals] = useState<{ boutTotals: any[]; overallTotals: any; grandTotal: string } | null>(null);

  const handleTotalsCalculated = (totals: { boutTotals: any[]; overallTotals: any; grandTotal: string }) => {
    // console.log("Received totals for fighter:", fighter.fighterName, totals); // Log the totals
    setTotals(totals); // Update the state with the calculated totals
  };

  return (
    <div>
      {/* Use the TotalsCalculator component to calculate the totals */}
      <TotalsCalculator fighter={fighter} onTotalsCalculated={handleTotalsCalculated} />

      <table className="match">
        <thead>
          <tr>
            <th colSpan={7} className={fighter.fighterColor}>
              {fighter.fighterName} ({fighter.fighterColor})
              {/* Add the IncrementFighterStrikeButton */}
              <IncrementFighterStrikeButton fighterId={fighter.fighterId} />
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
          {/* Display bout-specific averages */}
          {fighter.Bouts.map((_, index) => {
            const boutAverages = totals?.boutTotals?.[index] || {}; // Fetch bout-specific averages
            return (
              <tr key={index}>
                <td>{boutAverages.judgeCount || 0}</td>
                <td>{boutAverages.avgContact?.toFixed(1) || '0.00'}</td>
                <td>{boutAverages.avgTarget?.toFixed(1) || '0.00'}</td>
                <td>{boutAverages.avgControl?.toFixed(1) || '0.00'}</td>
                <td>{boutAverages.avgAfterBlow?.toFixed(1) || '0.00'}</td>
                <td>{boutAverages.avgSelfCall?.toFixed(1) || '0.00'}</td>
                <td>{boutAverages.avgDoubleHit?.toFixed(1) || '0.00'}</td>
              </tr>
            );
          })}
          {/* Display overall totals if available */}
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

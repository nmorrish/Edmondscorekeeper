import React, { useMemo } from 'react';

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
  Bouts: Score[][]; // Bouts now contain arrays of scores
}

// Define the props interface for ScoreDisplayComponent
interface ScoreDisplayComponentProps {
  fighter: Fighter;
}

// Main ScoreDisplayComponent that will show averages per bout and a totals row
const ScoreDisplayComponent: React.FC<ScoreDisplayComponentProps> = ({ fighter }) => {
  // Calculate averages for each bout and include totals
  const calculateAverages = (scores: Score[]) => {
    if (scores.length === 0) {
      return {
        avgContact: 0,
        avgTarget: 0,
        avgControl: 0,
        avgAfterBlow: 0,
        avgSelfCall: 0,
        avgDoubleHit: 0,
        totals: {
          contact: 0,
          target: 0,
          control: 0,
          afterBlow: 0,
          opponentSelfCall: 0,
        },
        judgeCount: 0, // No scores = 0 judges
      };
    }

    const totals = scores.reduce(
      (acc, score) => {
        acc.contact += score.contact;
        acc.target += score.target;
        acc.control += score.control;
        acc.afterBlow += score.afterBlow;
        acc.opponentSelfCall += score.opponentSelfCall;
        acc.doubleHit += score.doubleHit ? 1 : 0;
        return acc;
      },
      { contact: 0, target: 0, control: 0, afterBlow: 0, opponentSelfCall: 0, doubleHit: 0 }
    );

    const count = scores.length;

    return {
      avgContact: totals.contact / count,
      avgTarget: totals.target / count,
      avgControl: totals.control / count,
      avgAfterBlow: totals.afterBlow / count,
      avgSelfCall: totals.opponentSelfCall / count,
      avgDoubleHit: totals.doubleHit / count,
      totals, // Always return totals to use later
      judgeCount: count, // Number of judges is the number of scores
    };
  };

  // Calculate overall totals for the averages across all bouts
  const overallTotals = fighter.Bouts.reduce(
    (acc, boutScores) => {
      const averages = calculateAverages(boutScores); // Get averages for the bout
      acc.contact += averages.avgContact;
      acc.target += averages.avgTarget;
      acc.control += averages.avgControl;
      acc.afterBlow += averages.avgAfterBlow;
      acc.opponentSelfCall += averages.avgSelfCall;
      return acc;
    },
    { contact: 0, target: 0, control: 0, afterBlow: 0, opponentSelfCall: 0 }
  );

  return (
    <table className="match">
      <thead>
        <tr>
          <th colSpan={6} className={fighter.fighterColor}>{fighter.fighterName} ({fighter.fighterColor})</th>
        </tr>
        <tr>
          <th>Judges</th>
          <th>Contact</th>
          <th>Target</th>
          <th>Control</th>
          <th>A/B</th>
          <th>Call</th>
        </tr>
      </thead>
      <tbody>
        {fighter.Bouts.map((boutScores, index) => {
          const averages = calculateAverages(boutScores);
          return (
            <tr key={index}><td>{averages.judgeCount}</td><td>{averages.avgContact.toFixed(2)}</td><td>{averages.avgTarget.toFixed(2)}</td><td>{averages.avgControl.toFixed(2)}</td><td>{averages.avgAfterBlow.toFixed(2)}</td><td>{averages.avgSelfCall.toFixed(2)}</td></tr>
          );
        })}
        <tr className="subtotal-row">
          <td>Totals</td>
          <td>{overallTotals.contact.toFixed(2)}</td>
          <td>{overallTotals.target.toFixed(2)}</td>
          <td>{overallTotals.control.toFixed(2)}</td>
          <td>{overallTotals.afterBlow.toFixed(2)}</td>
          <td>{overallTotals.opponentSelfCall.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
  );
};

export default React.memo(ScoreDisplayComponent);

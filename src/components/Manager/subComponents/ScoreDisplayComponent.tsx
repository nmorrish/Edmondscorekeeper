import React, { useMemo } from 'react';

// Define the Score interface with proper numeric types
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
  Scores: Score[];
}

// Define the props interface for ScoreDisplayComponent
interface ScoreDisplayComponentProps {
  fighter: Fighter;
}

// Memoized table rows for better performance
const MemoizedTableRows: React.FC<{ scores: Score[] }> = React.memo(({ scores }) => (
  <>
    {scores.map((score, index) => (
      <tr key={index} style={score.doubleHit ? { textDecoration: 'line-through' } : {}}>
        <td>{score.contact}</td>
        <td>{score.target}</td>
        <td>{score.control}</td>
        <td>{score.afterBlow}</td>
        <td>{score.opponentSelfCall}</td>
      </tr>
    ))}
  </>
));

// Main ScoreDisplayComponent
const ScoreDisplayComponent: React.FC<ScoreDisplayComponentProps> = ({ fighter }) => {
  // Sum calculation, memoized to avoid unnecessary recalculations
  const calculateSum = (scores: Score[]) => {
    const totalScores = scores.reduce(
      (totals, score) => {
        return {
          contact: totals.contact + score.contact,
          target: totals.target + score.target,
          control: totals.control + score.control,
          afterBlow: totals.afterBlow + score.afterBlow,
          opponentSelfCall: totals.opponentSelfCall + score.opponentSelfCall,
        };
      },
      { contact: 0, target: 0, control: 0, afterBlow: 0, opponentSelfCall: 0 }
    );

    return {
      sumContact: totalScores.contact,
      sumTarget: totalScores.target,
      sumControl: totalScores.control,
      sumAfterBlow: totalScores.afterBlow,
      sumSelfCall: totalScores.opponentSelfCall,
      total:
        totalScores.contact +
        totalScores.target +
        totalScores.control +
        totalScores.afterBlow +
        totalScores.opponentSelfCall,
    };
  };

  // Memoize the result of the sum calculation
  const sum = useMemo(() => calculateSum(fighter.Scores), [fighter.Scores]);

  return (
    <table className="match">
      <thead>
        <tr>
          <th colSpan={5} className={fighter.fighterColor}>
            {fighter.fighterName} ({fighter.fighterColor})
          </th>
        </tr>
        <tr>
          <th className={fighter.fighterColor}>Contact</th>
          <th className={fighter.fighterColor}>Target</th>
          <th className={fighter.fighterColor}>Control</th>
          <th className={fighter.fighterColor}>A/B</th>
          <th className={fighter.fighterColor}>Call</th>
        </tr>
      </thead>
      <tbody>
        {/* Render memoized table rows */}
        <MemoizedTableRows scores={fighter.Scores} />
        <tr className="subtotal-row">
          <td>{sum.sumContact}</td>
          <td>{sum.sumTarget}</td>
          <td>{sum.sumControl}</td>
          <td>{sum.sumAfterBlow}</td>
          <td>{sum.sumSelfCall}</td>
        </tr>
        <tr className="total-row">
          <td colSpan={5}>Total: {sum.total}</td>
        </tr>
      </tbody>
    </table>
  );
};

// Memoize the entire ScoreDisplayComponent to prevent re-renders unless props change
export default React.memo(ScoreDisplayComponent);

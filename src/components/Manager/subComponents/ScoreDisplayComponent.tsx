import React from 'react';

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
  Scores: Score[];
}

interface ScoreDisplayComponentProps {
  fighter: Fighter;
}

const ScoreDisplayComponent: React.FC<ScoreDisplayComponentProps> = ({ fighter }) => {
  const calculateSum = (scores: Score[]) => {
    const totalScores = scores.reduce(
      (totals, score) => {
        return {
          contact: totals.contact + (parseInt(score.contact as any) || 0),
          target: totals.target + (parseInt(score.target as any) || 0),
          control: totals.control + (parseInt(score.control as any) || 0),
          afterBlow: totals.afterBlow + (parseInt(score.afterBlow as any) || 0),
          opponentSelfCall: totals.opponentSelfCall + (parseInt(score.opponentSelfCall as any) || 0),
        };
      },
      { contact: 0, target: 0, control: 0, afterBlow: 0, opponentSelfCall: 0 }
    );

    return {
      sumContact: Number(totalScores.contact),
      sumTarget: Number(totalScores.target),
      sumControl: Number(totalScores.control),
      sumAfterBlow: Number(totalScores.afterBlow),
      sumSelfCall: Number(totalScores.opponentSelfCall),
      total: Number(totalScores.contact + totalScores.target + totalScores.control + totalScores.afterBlow + totalScores.opponentSelfCall),
    };
  };

  const sum = calculateSum(fighter.Scores);

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
        {fighter.Scores.map((score, index) => (
          <tr key={index} style={score.doubleHit ? { textDecoration: 'line-through' } : {}}>
            <td>{score.contact}</td>
            <td>{score.target}</td>
            <td>{score.control}</td>
            <td>{score.afterBlow}</td>
            <td>{score.opponentSelfCall}</td>
          </tr>
        ))}
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

export default ScoreDisplayComponent;

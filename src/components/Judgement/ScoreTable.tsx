import React, { useCallback } from 'react';

interface Fighter {
  fighterId: number;
  fighterName: string;
  fighterColor: string;
}

interface ScoreTableProps {
  fighter: Fighter;
  opponent: Fighter;
  scores: Record<string, boolean>;
  onCheckboxChange: (fighterId: number, criteria: string) => void;
  onSubmit: (action: { fighterId?: number; opponentId?: number; doubleHit?: boolean }) => void;
}

const ScoreTable: React.FC<ScoreTableProps> = ({ fighter, opponent, scores, onCheckboxChange, onSubmit }) => {
  // Memoizing the event handler to avoid re-creating it on every render
  const handleCheckboxChange = useCallback(
    (criteria: string) => onCheckboxChange(fighter.fighterId, criteria),
    [fighter.fighterId, onCheckboxChange]
  );

  const handleAfterBlowSubmit = useCallback(
    () => onSubmit({ fighterId: fighter.fighterId, doubleHit: false }),
    [fighter.fighterId, onSubmit]
  );

  const handleSelfCallSubmit = useCallback(
    () => onSubmit({ opponentId: opponent.fighterId, doubleHit: false }),
    [opponent.fighterId, onSubmit]
  );

  return (
    <div className={`${fighter.fighterColor}`}>
      <table className="match">
        <thead>
          <tr>
            <th colSpan={3}>
              {fighter.fighterName} ({fighter.fighterColor})
            </th>
          </tr>
          <tr>
            <th>Contact</th>
            <th>Target</th>
            <th>Control</th>
          </tr>
        </thead>
        <tbody>
          <tr className="checkbox-row">
            <td>
              <input
                type="checkbox"
                name={`contact-${fighter.fighterId}`}
                checked={scores.contact || false}
                onChange={() => handleCheckboxChange('contact')}
              />
            </td>
            <td>
              <input
                type="checkbox"
                name={`target-${fighter.fighterId}`}
                checked={scores.target || false}
                onChange={() => handleCheckboxChange('target')}
              />
            </td>
            <td>
              <input
                type="checkbox"
                name={`control-${fighter.fighterId}`}
                checked={scores.control || false}
                onChange={() => handleCheckboxChange('control')}
              />
            </td>
          </tr>
        </tbody>
      </table>
      <input
        type="button"
        className="scoreButton"
        name={`afterblow-${fighter.fighterId}`}
        value={`afterblow: ${fighter.fighterColor} hit first`}
        onClick={handleAfterBlowSubmit}
      />
      <input
        type="button"
        className="scoreButton"
        name={`selfCall-${fighter.fighterId}`}
        value={`self-call: ${fighter.fighterColor} point concede`}
        onClick={handleSelfCallSubmit}
      />
    </div>
  );
};

// Memoize the entire ScoreTable component to avoid unnecessary re-renders
export default React.memo(ScoreTable);

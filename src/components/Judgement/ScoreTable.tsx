/**
 * src/components/Judgement/ScoreTable.tsx
 * 
 * This display the table judges use to Pass Judgement on a bout.
 *
 * Table displays fighter's name and color. 
 * Has checkboxes for Contact, Target, Control.
 * Has buttons for AfterBlows and Self-calls.
 * 
 * For ease of formatting, duplicate code reduction, and conformance to database structure, 
 * one table will be rendered for each fighter (2 tables rendered per exchange).`
 */
import React, { useCallback } from 'react';

interface Fighter {
  fighterId: number;
  fighterName: string;
  fighterColor: string;
}

//Properties passed to table component.
interface ScoreTableProps {
  fighter: Fighter;
  opponent: Fighter;
  scores: Record<string, boolean>;
  onCheckboxChange: (fighterId: number, criteria: string) => void;
  onSubmit: (action: { fighterId?: number; opponentId?: number; doubleHit?: boolean }) => void;
  onConfirm: (message: string, action: () => void) => void;
}

//Handlers internal to the ScoreTable component
const ScoreTable: React.FC<ScoreTableProps> = ({
  fighter,
  opponent,
  scores,
  onCheckboxChange,
  onSubmit,
  onConfirm,
}) => {
  // Handles the checkbox change and clears the opponent's scores
  const handleCheckboxChange = useCallback(
    (criteria: string) => {
      // First, clear the opponent's scores
      onCheckboxChange(opponent.fighterId, 'clear');

      // Then, update the fighter's scores
      onCheckboxChange(fighter.fighterId, criteria);
    },
    [fighter.fighterId, opponent.fighterId, onCheckboxChange]
  );

  //Submit for AfterBlow button.
  const handleAfterBlowSubmit = useCallback(
    () => onConfirm('Confirm Afterblow?', () => onSubmit({ fighterId: fighter.fighterId, doubleHit: false })),
    [fighter.fighterId, onConfirm, onSubmit]
  );

  //Submit for SelfCall button.
  const handleSelfCallSubmit = useCallback(
    () => onConfirm('Confirm Self-call?', () => onSubmit({ opponentId: opponent.fighterId, doubleHit: false })),
    [opponent.fighterId, onConfirm, onSubmit]
  );


  //Render the scoring table for one fighter.
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

export default React.memo(ScoreTable);
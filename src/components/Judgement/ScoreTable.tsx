import React from 'react';

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
                                onChange={() => onCheckboxChange(fighter.fighterId, 'contact')}
                            />
                        </td>
                        <td>
                            <input
                                type="checkbox"
                                name={`target-${fighter.fighterId}`}  // Changed from 'quality' to 'target'
                                checked={scores.target || false}       // Changed from 'quality' to 'target'
                                onChange={() => onCheckboxChange(fighter.fighterId, 'target')}  // Changed from 'quality' to 'target'
                            />
                        </td>
                        <td>
                            <input
                                type="checkbox"
                                name={`control-${fighter.fighterId}`}
                                checked={scores.control || false}
                                onChange={() => onCheckboxChange(fighter.fighterId, 'control')}
                            />
                        </td>
                    </tr>
                </tbody>
            </table>
            <input
                type="button"
                className='scoreButton'
                name={`afterblow-${fighter.fighterId}`}
                value={`afterblow: ${fighter.fighterColor} hit first`}
                onClick={() => onSubmit({ fighterId: fighter.fighterId, doubleHit: false })} // fighter hit first in this afterBlow
            />
            <input
                type="button"
                className='scoreButton'
                name={`selfCall-${fighter.fighterId}`}
                value={`self-call: ${fighter.fighterColor} point concede`}
                onClick={() => onSubmit({ opponentId: opponent.fighterId, doubleHit: false })} // selfCall, opponent gets the point
            />
        </div>
    );
};

export default ScoreTable;

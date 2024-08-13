import React from 'react';

interface Bout {
    boutId: number;
    fighterColor: string;
    fighterId: number;
    fighterName: string;
}

interface ScoreTableProps {
    fighter: Bout;
    scores: Record<string, boolean>;
    onCheckboxChange: (fighterId: number, criteria: string) => void;
}

const ScoreTable: React.FC<ScoreTableProps> = ({ fighter, scores, onCheckboxChange }) => {
    return (
        <div>
            <table className="match">
                <thead>
                    <tr>
                        <th colSpan={3} className={fighter.fighterColor}>
                            {fighter.fighterName} ({fighter.fighterColor})
                        </th>
                    </tr>
                    <tr>
                        <th className={fighter.fighterColor}>Contact</th>
                        <th className={fighter.fighterColor}>Quality</th>
                        <th className={fighter.fighterColor}>Control</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className="checkbox-row">
                        <td className={fighter.fighterColor}>
                            <input
                                type="checkbox"
                                name={`contact-${fighter.fighterId}`}
                                checked={scores.contact || false}
                                onChange={() => onCheckboxChange(fighter.fighterId, 'contact')}
                            />
                        </td>
                        <td className={fighter.fighterColor}>
                            <input
                                type="checkbox"
                                name={`quality-${fighter.fighterId}`}
                                checked={scores.quality || false}
                                onChange={() => onCheckboxChange(fighter.fighterId, 'quality')}
                            />
                        </td>
                        <td className={fighter.fighterColor}>
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
                className={fighter.fighterColor}
                name={`afterblow-${fighter.fighterId}`}
                value={`afterblow: ${fighter.fighterColor} hit first`}
            />
            <input
                type="button"
                className={fighter.fighterColor}
                name={`selfCall-${fighter.fighterId}`}
                value={`self-call: ${fighter.fighterColor} point concede`}
            />
        </div>
    );
};

export default ScoreTable;

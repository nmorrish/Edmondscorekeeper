import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { domain_uri } from './contants';

interface Bout {
    boutId: number;
    fighterColor: string;
    fighterId: number;
    fighterName: string;
}

interface JudgementData {
    matchId: number;
    matchRing: number;
    Bouts: Record<number, Bout>;
}

const JudgementManager: React.FC = () => {
    const { ringNumber } = useParams<{ ringNumber: string }>();
    const [judgementData, setJudgementData] = useState<JudgementData | null>(null);
    const [scores, setScores] = useState<Record<number, Record<string, boolean>>>({});

    useEffect(() => {
        const eventSource = new EventSource(`${ domain_uri }/requestJudgementSSE.php`);

        eventSource.onmessage = (event) => {
            if (event.data) {
                try {
                    const data: JudgementData = JSON.parse(event.data);
                    console.log("Pending judges count increased:", data);

                    // Initialize scores to false for all criteria and fighters
                    const initialScores = Object.values(data.Bouts).reduce((acc: Record<number, Record<string, boolean>>, bout: Bout) => {
                        acc[bout.fighterId] = {
                            contact: false,
                            quality: false,
                            control: false,
                        };
                        return acc;
                    }, {} as Record<number, Record<string, boolean>>);

                    setJudgementData(data);
                    setScores(initialScores);
                } catch (error) {
                    console.error('Error parsing SSE data:', error);
                }
            }
        };

        eventSource.onerror = (error) => {
            console.error('SSE connection error:', error);
            eventSource.close();
        };

        // Cleanup on component unmount
        return () => {
            eventSource.close();
        };
    }, []);

    const handleCheckboxChange = (fighterId: number, criteria: string) => {
        setScores((prevScores) => ({
            ...prevScores,
            [fighterId]: {
                ...prevScores[fighterId],
                [criteria]: !prevScores[fighterId]?.[criteria],
            },
        }));
    };

    const handleSubmit = async () => {
        if (judgementData) {
            const data = {
                matchId: judgementData.matchId,
                Bouts: Object.values(judgementData.Bouts).map((bout) => ({
                    boutId: bout.boutId,
                    fighterColor: bout.fighterColor,
                    fighterId: bout.fighterId,
                    scores: {
                        contact: scores[bout.fighterId]?.contact || false,
                        quality: scores[bout.fighterId]?.quality || false,
                        control: scores[bout.fighterId]?.control || false,
                    },
                })),
            };

            try {
                const response = await fetch(`${ domain_uri }/judgementSubmit.php`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data),
                });

                const result = await response.json();
                console.log("Judgement submitted:", result);
                setJudgementData(null);
            } catch (error) {
                console.error('Error submitting judgement:', error);
            }
        }
    };

    if (!ringNumber) {
        return (
            <div>
                <h1>Critical Judgement Error</h1>
                <p>Ring not found</p>
            </div>
        );
    } else if (judgementData === null) {
        return (
            <div>
                <h1>Judgement Wait</h1>
                {ringNumber && <p>You are judging ring {ringNumber}</p>}
            </div>
        );
    } else {
        const bouts = Object.values(judgementData.Bouts);
        const fighter1 = bouts[0];
        const fighter2 = bouts[1];

        return (
            <div>
                <h1>Judgement Now Make!</h1>
                <table className="match">
                    <thead>
                        <tr>
                            <th colSpan={3} className={fighter1.fighterColor}>
                                {fighter1.fighterName} ({fighter1.fighterColor})
                            </th>
                        </tr>
                        <tr>
                            <th className={fighter1.fighterColor}>Contact</th>
                            <th className={fighter1.fighterColor}>Quality</th>
                            <th className={fighter1.fighterColor}>Control</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="checkbox-row">
                            <td className={fighter1.fighterColor}><input type="checkbox" name={`contact-${fighter1.fighterId}`} checked={scores[fighter1.fighterId]?.contact || false} onChange={() => handleCheckboxChange(fighter1.fighterId, 'contact')} /></td>
                            <td className={fighter1.fighterColor}><input type="checkbox" name={`quality-${fighter1.fighterId}`} checked={scores[fighter1.fighterId]?.quality || false} onChange={() => handleCheckboxChange(fighter1.fighterId, 'quality')} /></td>
                            <td className={fighter1.fighterColor}><input type="checkbox" name={`control-${fighter1.fighterId}`} checked={scores[fighter1.fighterId]?.control || false} onChange={() => handleCheckboxChange(fighter1.fighterId, 'control')} /></td>
                        </tr>
                    </tbody>
                </table>

                <table className="match">
                    <thead>
                        <tr>
                            <th colSpan={3} className={fighter2.fighterColor}>
                                {fighter2.fighterName} ({fighter2.fighterColor})
                            </th>
                        </tr>
                        <tr>
                            <th className={fighter2.fighterColor}>Contact</th>
                            <th className={fighter2.fighterColor}>Quality</th>
                            <th className={fighter2.fighterColor}>Control</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="checkbox-row">
                            <td className={fighter2.fighterColor}><input type="checkbox" name={`contact-${fighter2.fighterId}`} checked={scores[fighter2.fighterId]?.contact || false} onChange={() => handleCheckboxChange(fighter2.fighterId, 'contact')} /></td>
                            <td className={fighter2.fighterColor}><input type="checkbox" name={`quality-${fighter2.fighterId}`} checked={scores[fighter2.fighterId]?.quality || false} onChange={() => handleCheckboxChange(fighter2.fighterId, 'quality')} /></td>
                            <td className={fighter2.fighterColor}><input type="checkbox" name={`control-${fighter2.fighterId}`} checked={scores[fighter2.fighterId]?.control || false} onChange={() => handleCheckboxChange(fighter2.fighterId, 'control')} /></td>
                        </tr>
                    </tbody>
                </table>
                <button onClick={handleSubmit}>Submit Judgement</button>
            </div>
        );
    }
};

export default JudgementManager;

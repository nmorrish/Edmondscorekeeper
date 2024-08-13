import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { domain_uri } from '../utility/contants';
import ScoreTable from './ScoreTable';

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
        const eventSource = new EventSource(`${domain_uri}/requestJudgementSSE.php`);

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
                            afterBlow: false,
                            opponentSelfCall: false
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

    const handleSubmit = async (action: { fighterId?: number; opponentId?: number; doubleHit?: boolean }) => {
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
                        afterBlow: action.fighterId === bout.fighterId && action.doubleHit === false ? true : false,
                        opponentSelfCall: action.opponentId === bout.fighterId ? true : false,
                        doubleHit: action.doubleHit || false,
                    },
                })),
            };

            try {
                const response = await fetch(`${domain_uri}/judgementScoreSubmit.php`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data),
                });

                const result = await response.json();
                console.log("Judgement submitted:", result);
                setJudgementData(null);
                setScores({}); // Reset scores after submission
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
                <ScoreTable
                    fighter={fighter1}
                    opponent={fighter2}
                    scores={scores[fighter1.fighterId] || {}}
                    onCheckboxChange={handleCheckboxChange}
                    onSubmit={handleSubmit} // Pass handleSubmit to ScoreTable
                />
                <ScoreTable
                    fighter={fighter2}
                    opponent={fighter1}
                    scores={scores[fighter2.fighterId] || {}}
                    onCheckboxChange={handleCheckboxChange}
                    onSubmit={handleSubmit} // Pass handleSubmit to ScoreTable
                />
                <button className='judgement-submit' onClick={() => handleSubmit({})}>Submit Judgement</button>
                <button className='judgement-submit double' onClick={() => handleSubmit({ doubleHit: true })}>Double Hit</button>
            </div>
        );
    }
};

export default JudgementManager;

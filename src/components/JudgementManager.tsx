import React, { useEffect, useState } from 'react';
import { domain_uri } from './contants';
import { useParams } from 'react-router-dom';

interface JudgementData {
    matchId: number;
    fighters: {
        fighter1id: number;
        fighter1name: string;
        fighter1color: string;
        fighter2id: number;
        fighter2name: string;
        fighter2color: string;
    }[];
}

const JudgementManager: React.FC = () => {
    const { ringNumber } = useParams<{ ringNumber: string }>();
    const [judgementData, setJudgementData] = useState<JudgementData | null>(null);

    useEffect(() => {
        const eventSource = new EventSource(`${domain_uri}/requestJudgementSSE.php`);

        eventSource.onmessage = (event) => {
            if (event.data) {
                try {
                    const data = JSON.parse(event.data);
                    console.log("Pending judges count increased:", data); // Log the received data
                    setJudgementData(data); // Update state with the new data if needed
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

    if (!ringNumber) {
        return (
            <div>
                <h1>Critical Judgement Error</h1>
                <p>Ring not found</p>
            </div>
        );
    }

    return (
        <div>
            <h1>Judgement Pending</h1>
            {ringNumber && <p>You are judging ring {ringNumber}</p>}
            {judgementData && (
                <div>
                    <h2>Match ID: {judgementData.matchId}</h2>
                    {/* <p>Fighter 1: {judgementData.fighters[0].fighter1name} ({judgementData.fighters[0].fighter1color})</p>
                    <p>Fighter 2: {judgementData.fighters[1].fighter2name} ({judgementData.fighters[1].fighter2color})</p> */}
                </div>
            )}
        </div>
    );
};

export default JudgementManager;

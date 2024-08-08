// JudgementManager.tsx
import React, { useEffect, useState } from 'react';
import { domain_uri } from './contants';

interface JudgementManagerProps {
    ringNumber?: string;
}

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

const JudgementManager: React.FC<JudgementManagerProps> = ({ ringNumber }) => {
    const [judgementData, setJudgementData] = useState<JudgementData | null>(null);

    console.log("receivedData:",judgementData);

    useEffect(() => {
        const eventSource = new EventSource(`${domain_uri}/triggerJudgement.php`);

        eventSource.onmessage = (event) => {
            const data: JudgementData = JSON.parse(event.data);
            setJudgementData(data);
        };

        eventSource.onerror = (error) => {
            console.error('SSE connection error:', error);
            eventSource.close();
        };

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
            <h1>Judgement Manager</h1>
            {ringNumber && <p>You are judging ring {ringNumber}</p>}
            {judgementData && (
                <div>
                    <h2>Match ID: {judgementData.matchId}</h2>
                    <p>Fighter 1: {judgementData.fighters[0].fighter1name} ({judgementData.fighters[0].fighter1color})</p>
                    <p>Fighter 2: {judgementData.fighters[1].fighter2name} ({judgementData.fighters[1].fighter2color})</p>
                </div>
            )}
        </div>
    );
};

export default JudgementManager;

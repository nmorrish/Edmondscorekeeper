import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { domain_uri } from '../utility/contants';
import ScoreTable from './ScoreTable';

// Utility functions to manage cookies and session storage
const getCookie = (name: string) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
};

const setCookie = (name: string, value: string, days: number) => {
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/`;
};

interface JudgementData {
  matchId: number;
  matchRing: number;
  boutId: number;
  fighter1Id: number;
  fighter1Name: string;
  fighter1Color: string;
  fighter2Id: number;
  fighter2Name: string;
  fighter2Color: string;
}

const JudgementManager: React.FC = () => {
  const { ringNumber } = useParams<{ ringNumber: string }>();
  const [judgementData, setJudgementData] = useState<JudgementData | null>(null);
  const [scores, setScores] = useState<Record<number, Record<string, boolean>>>({});
  const [judgeName, setJudgeName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const maxRetries = 3;
  const retryDelay = 3000;

  useEffect(() => {
    const storedJudgeName = getCookie('judgeName') || sessionStorage.getItem('judgeName');
    if (storedJudgeName) setJudgeName(storedJudgeName);
  }, []);

  const handleNameSubmit = useCallback(() => {
    if (nameInput.trim()) {
      const trimmedName = nameInput.trim();
      setJudgeName(trimmedName);
      setCookie('judgeName', trimmedName, 2);
      sessionStorage.setItem('judgeName', trimmedName);
    }
  }, [nameInput]);

  const connectToSSE = useCallback((retriesLeft: number) => {
    const eventSource = new EventSource(`${domain_uri}/requestJudgementSSE.php`);

    eventSource.onmessage = (event) => {
      if (event.data) {
        try {
          const data: JudgementData | null = JSON.parse(event.data);
          if (data) {
            setJudgementData(data);
            setScores({
              [data.fighter1Id]: { contact: false, target: false, control: false, afterBlow: false, opponentSelfCall: false },
              [data.fighter2Id]: { contact: false, target: false, control: false, afterBlow: false, opponentSelfCall: false }
            });
          }
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      if (retriesLeft > 0) {
        setTimeout(() => connectToSSE(retriesLeft - 1), retryDelay);
      }
    };

    return eventSource;
  }, []);

  useEffect(() => {
    const eventSource = connectToSSE(maxRetries);
    return () => eventSource.close();
  }, [connectToSSE]);

  const handleCheckboxChange = useCallback((fighterId: number, criteria: string) => {
    setScores((prevScores) => ({
      ...prevScores,
      [fighterId]: {
        ...prevScores[fighterId],
        [criteria]: !prevScores[fighterId]?.[criteria],
      },
    }));
  }, []);

  const handleConfirmation = (message: string, action: () => void) => {
    if (window.confirm(message)) {
      action();
    }
  };

  const hasCheckedValues = useCallback(() => {
    return (
      Object.values(scores[judgementData?.fighter1Id || 0] || {}).some(Boolean) ||
      Object.values(scores[judgementData?.fighter2Id || 0] || {}).some(Boolean)
    );
  }, [scores, judgementData]);

  const handleSubmit = useCallback(
    async (action: { fighterId?: number; opponentId?: number; doubleHit?: boolean }) => {
      if (judgementData && judgeName) {
        // Prepare the data based on the action (afterblow, self-call, double-hit, or normal submit)
        const fighter1Scores = {
          contact: action.doubleHit === undefined ? scores[judgementData.fighter1Id]?.contact || false : false,
          target: action.doubleHit === undefined ? scores[judgementData.fighter1Id]?.target || false : false,
          control: action.doubleHit === undefined ? scores[judgementData.fighter1Id]?.control || false : false,
          afterBlow: action.fighterId === judgementData.fighter1Id && action.doubleHit === false ? true : false,
          opponentSelfCall: action.opponentId === judgementData.fighter1Id ? true : false,
          doubleHit: action.doubleHit || false,
          judgeName: judgeName,
        };

        const fighter2Scores = {
          contact: action.doubleHit === undefined ? scores[judgementData.fighter2Id]?.contact || false : false,
          target: action.doubleHit === undefined ? scores[judgementData.fighter2Id]?.target || false : false,
          control: action.doubleHit === undefined ? scores[judgementData.fighter2Id]?.control || false : false,
          afterBlow: action.fighterId === judgementData.fighter2Id && action.doubleHit === false ? true : false,
          opponentSelfCall: action.opponentId === judgementData.fighter2Id ? true : false,
          doubleHit: action.doubleHit || false,
          judgeName: judgeName,
        };

        const data = {
          matchId: judgementData.matchId,
          boutId: judgementData.boutId,
          scores: {
            [judgementData.fighter1Id]: fighter1Scores,
            [judgementData.fighter2Id]: fighter2Scores,
          },
        };

        try {
          console.log('Submitting data:', data);

          const response = await fetch(`${domain_uri}/judgementScoreSubmit.php`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
          });

          const result = await response.json();
          console.log('Judgement submitted:', result);
          setJudgementData(null);
          setScores({}); // Reset scores after submission
        } catch (error) {
          console.error('Error submitting judgement:', error);
        }
      }
    },
    [judgementData, scores, judgeName]
  );

  const fighter1 = useMemo(() => judgementData ? {
    fighterId: judgementData.fighter1Id,
    fighterName: judgementData.fighter1Name,
    fighterColor: judgementData.fighter1Color,
  } : null, [judgementData]);

  const fighter2 = useMemo(() => judgementData ? {
    fighterId: judgementData.fighter2Id,
    fighterName: judgementData.fighter2Name,
    fighterColor: judgementData.fighter2Color,
  } : null, [judgementData]);

  if (!judgeName) {
    return (
      <div>
        <h1>Enter Your Name</h1>
        <form onSubmit={(e) => { e.preventDefault(); handleNameSubmit(); }}>
          <input
            type="text"
            placeholder="Enter your name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
          />
          <button type="submit">Submit</button>
        </form>
      </div>
    );
  }

  if (!judgementData) {
    return (
      <div>
        <h1>Judgement Wait</h1>
        <p>You are judging ring {ringNumber} as {judgeName}</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Judgement Now Make!</h1>
      {fighter1 && fighter2 && (
        <>
          <ScoreTable
            fighter={fighter1}
            opponent={fighter2}
            scores={scores[fighter1.fighterId] || {}}
            onCheckboxChange={handleCheckboxChange}
            onSubmit={handleSubmit}
            onConfirm={handleConfirmation}
          />
          <ScoreTable
            fighter={fighter2}
            opponent={fighter1}
            scores={scores[fighter2.fighterId] || {}}
            onCheckboxChange={handleCheckboxChange}
            onSubmit={handleSubmit}
            onConfirm={handleConfirmation}
          />
        </>
      )}
      <button
        className="judgement-submit"
        onClick={() => handleConfirmation('Confirm Judgement?', () => handleSubmit({}))}
      >
        {hasCheckedValues() ? 'Submit Judgement' : 'Report No Exchange'}
      </button>
      <button
        className="judgement-submit double"
        onClick={() => handleConfirmation('Confirm Double Hit?', () => handleSubmit({ doubleHit: true }))}
      >
        Double Hit
      </button>
    </div>
  );
};

export default JudgementManager;

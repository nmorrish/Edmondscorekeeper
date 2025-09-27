/**
 *  src/components/Judgement/JudgementManager.tsx
 * 
 * == Judgement Manager ==
 * SSE client for judges. Hardened with:
 * - Exponential backoff retries
 * - Heartbeat tracking / reconnect if stale
 * - Explicit event listeners
 * - Manual reconnect button
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { backend_uri, sse_send_to_to_judge_api, judge_score_submit_api } from '../utility/endpoints';
import ScoreTable from './ScoreTable';

// Cookie utils
const getCookie = (name: string) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
};

const setCookie = (name: string, value: string, days: number) => {
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/`;
};

// Judgement payload
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
  const [lastHeartbeat, setLastHeartbeat] = useState(Date.now());
  const [esInstance, setEsInstance] = useState<EventSource | null>(null);
  const [lastSeenJudgement, setLastSeenJudgement] = useState<string | null>(null);

  // retrieve judge name
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

  /**
   * SSE connection with exponential backoff
   */
  const connectToSSE = useCallback((retry = 0) => {
    if (!ringNumber) return;

    const url = `${backend_uri}/${sse_send_to_to_judge_api}?ringNumber=${ringNumber}`;
    const es = new EventSource(url);

    // main messages (judgement or initial null)
    es.onmessage = (event) => {
      if (!event.data) return;
      try {
        const data: any = JSON.parse(event.data);
        if (data && data.lastJudgement) {
          // only update if lastJudgement differs from last one we saw
          if (data.lastJudgement !== lastSeenJudgement) {
            setJudgementData(data);
            setScores({
              [data.fighter1Id]: { contact: false, target: false, control: false, afterBlow: false, opponentSelfCall: false },
              [data.fighter2Id]: { contact: false, target: false, control: false, afterBlow: false, opponentSelfCall: false }
            });
            setLastSeenJudgement(data.lastJudgement);
          } else {
            console.log("Duplicate lastJudgement ignored:", data.lastJudgement);
          }
        }
      } catch (err) {
        console.error("Error parsing SSE data:", err);
      }
    };


    // heartbeat lines (comments from server)
    es.addEventListener("heartbeat", () => {
      setLastHeartbeat(Date.now());
    });

    es.onopen = () => {
      console.log("SSE connected.");
      setLastHeartbeat(Date.now());
      setEsInstance(es);
    };

    es.onerror = () => {
      console.warn("SSE error, closing.");
      es.close();
      setEsInstance(null);

      // exponential backoff w/ jitter
      const delay = Math.min(30000, 1000 * Math.pow(2, retry)) + Math.random() * 500;
      setTimeout(() => connectToSSE(retry + 1), delay);
    };

    return es;
  }, [ringNumber]);

  // mount/unmount
  useEffect(() => {
    const es = connectToSSE(0);
    return () => es && es.close();
  }, [connectToSSE]);

  // watchdog: reconnect if no heartbeat for >30s
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastHeartbeat > 30000) {
        console.warn("Heartbeat stale, reconnecting SSE...");
        esInstance?.close();
        setEsInstance(null);
        connectToSSE(0);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [lastHeartbeat, esInstance, connectToSSE]);

  // scoring
  const handleCheckboxChange = useCallback((fighterId: number, criteria: string) => {
    if (criteria === 'clear') {
      setScores((prev) => ({
        ...prev,
        [fighterId]: { contact: false, target: false, control: false, afterBlow: false, opponentSelfCall: false },
      }));
    } else {
      setScores((prev) => ({
        ...prev,
        [fighterId]: {
          ...prev[fighterId],
          [criteria]: !prev[fighterId]?.[criteria],
        },
      }));
    }
  }, []);

  const handleConfirmation = (message: string, action: () => void) => {
    if (window.confirm(message)) action();
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
        const fighter1Scores = {
          contact: action.doubleHit === undefined ? scores[judgementData.fighter1Id]?.contact || false : false,
          target: action.doubleHit === undefined ? scores[judgementData.fighter1Id]?.target || false : false,
          control: action.doubleHit === undefined ? scores[judgementData.fighter1Id]?.control || false : false,
          afterBlow: action.fighterId === judgementData.fighter1Id && action.doubleHit === false,
          opponentSelfCall: action.opponentId === judgementData.fighter1Id,
          doubleHit: action.doubleHit || false,
          judgeName,
        };
        const fighter2Scores = {
          contact: action.doubleHit === undefined ? scores[judgementData.fighter2Id]?.contact || false : false,
          target: action.doubleHit === undefined ? scores[judgementData.fighter2Id]?.target || false : false,
          control: action.doubleHit === undefined ? scores[judgementData.fighter2Id]?.control || false : false,
          afterBlow: action.fighterId === judgementData.fighter2Id && action.doubleHit === false,
          opponentSelfCall: action.opponentId === judgementData.fighter2Id,
          doubleHit: action.doubleHit || false,
          judgeName,
        };
        const data = {
          matchId: judgementData.matchId,
          boutId: judgementData.boutId,
          scores: {
            [judgementData.fighter1Id]: fighter1Scores,
            [judgementData.fighter2Id]: fighter2Scores,
          },
        };
        const response = await fetch(`${backend_uri}/${judge_score_submit_api}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });

        const result = await response.json();
        console.log('Judgement submitted:', result);

        // Clear state after successful submission
        setJudgementData(null);
        setScores({});
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
        <button
          onClick={() => {
            if (window.confirm("Pounding refresh like a jackhammer will cause you to miss updates. Click 'OK' if you promise to be patient and refresh sparingly.")) {
              esInstance?.close();
              connectToSSE(0);
            }
          }}
        >
          Refresh Connection
        </button>
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

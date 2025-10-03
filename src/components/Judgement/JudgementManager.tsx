/**
 *  src/components/Judgement/JudgementManager.tsx
 * 
 * == Judgement Manager ==
 * SSE client for judges. Hardened with:
 * - Exponential backoff retries
 * - Heartbeat tracking / reconnect if stale
 * - Explicit event listeners
 * - Manual reconnect button
 * - Change Ring button (fetches max rings from backend)
 * - Connection status indicator (✅ on heartbeat pulse, ⚠️ if stale)
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { backend_uri, sse_send_to_to_judge_api, judge_score_submit_api } from '../utility/endpoints';
import ScoreTable from './ScoreTable';
import { apiQuery } from '../utility/apiClient';

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
  boutId?: number;
  fighter1Id: number;
  fighter1Name: string;
  fighter1Color: string;
  fighter2Id: number;
  fighter2Name: string;
  fighter2Color: string;
  lastJudgement: string;
  judgesSubmitted?: string[];
}

const JudgementManager: React.FC = () => {
  const { ringNumber } = useParams<{ ringNumber: string }>();
  const navigate = useNavigate();

  const [judgementData, setJudgementData] = useState<JudgementData | null>(null);
  const [scores, setScores] = useState<Record<number, Record<string, boolean>>>({});
  const [judgeName, setJudgeName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [lastHeartbeat, setLastHeartbeat] = useState(Date.now());
  const [_, setEsInstance] = useState<EventSource | null>(null);
  const [lastSeenJudgement, setLastSeenJudgement] = useState<string | null>(null);

  // rings
  const [availableRings, setAvailableRings] = useState<number[]>([]);
  const [showRingSelect, setShowRingSelect] = useState(false);

  // connection status
  const [connectionStatus, setConnectionStatus] = useState<"ok" | "warn">("ok");
  const [showPulse, setShowPulse] = useState(false);

  // shared button style
  const buttonStyle: React.CSSProperties = {
    backgroundColor: "#222",
    color: "#fff",
    border: "1px solid #444",
    padding: "0.6rem 1.2rem",
    margin: "0.4rem",
    borderRadius: "6px",
    fontWeight: 600,
    cursor: "pointer",
    WebkitAppearance: "none",
    MozAppearance: "none",
    appearance: "none",
  };

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

  // Fetch max rings
  useEffect(() => {
    async function fetchRings() {
      try {
        const resp = await apiQuery(`${backend_uri}/eventApi.php?ringsOnly=1`);
        const data = await resp.json();
        if (data.status === "success" && data.maxRings > 0) {
          setAvailableRings(Array.from({ length: data.maxRings }, (_, i) => i + 1));
        } else {
          setAvailableRings([1]);
        }
      } catch {
        setAvailableRings([1]);
      }
    }
    fetchRings();
  }, []);

  /**
   * SSE connection
   */
  const connectToSSE = useCallback((retry = 0) => {
    if (!ringNumber) return;

    const url = `${backend_uri}/${sse_send_to_to_judge_api}?ringNumber=${ringNumber}`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      if (!event.data) return;
      try {
        const data: any = JSON.parse(event.data);
        if (data && data.lastJudgement) {
          if (data.lastJudgement !== lastSeenJudgement) {
            if (judgeName && data.judgesSubmitted?.includes(judgeName)) {
              setJudgementData(null);
            } else {
              setJudgementData(data);
              setScores({
                [data.fighter1Id]: { contact: false, target: false, control: false, afterBlow: false, opponentSelfCall: false },
                [data.fighter2Id]: { contact: false, target: false, control: false, afterBlow: false, opponentSelfCall: false }
              });
            }
            setLastSeenJudgement(data.lastJudgement);
          }
        }
      } catch (err) {
        console.error("Error parsing SSE data:", err);
      }
    };

    es.addEventListener("heartbeat", () => {
      setLastHeartbeat(Date.now());
      setConnectionStatus("ok");
      setShowPulse(true);
      setTimeout(() => setShowPulse(false), 600);
    });

    es.onopen = () => {
      setLastHeartbeat(Date.now());
      setConnectionStatus("ok");
      setEsInstance(es);
    };

    es.onerror = () => {
      es.close();
      setEsInstance(null);
      setConnectionStatus("warn");
      const delay = Math.min(30000, 1000 * Math.pow(2, retry)) + Math.random() * 500;
      setTimeout(() => connectToSSE(retry + 1), delay);
    };

    return es;
  }, [ringNumber, lastSeenJudgement, judgeName]);

  useEffect(() => {
    const es = connectToSSE(0);
    return () => es && es.close();
  }, [connectToSSE]);

  // check for stale heartbeats
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastHeartbeat > 10000) {
        setConnectionStatus("warn");
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [lastHeartbeat]);

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
        const response = await apiQuery(`${backend_uri}/${judge_score_submit_api}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        await response.json();
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

  // ===================== Connection Indicator =====================
  const ConnectionIndicator = () => {
    if (connectionStatus === "warn") {
      return (
        <div style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          fontSize: "1.5rem"
        }}>
          ⚠️
        </div>
      );
    }
    if (showPulse) {
      return (
        <div
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            fontSize: "1.5rem",
            animation: "pulse 0.6s ease"
          }}
        >
          ✅
        </div>
      );
    }
    return null;
  };

  // ===================== UI =====================
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
          <button type="submit" style={buttonStyle}>Submit</button>
        </form>
        <ConnectionIndicator />
        <style>
          {`
            @keyframes pulse {
              0% { transform: scale(1); opacity: 0; }
              50% { transform: scale(1.4); opacity: 1; }
              100% { transform: scale(1); opacity: 0; }
            }
          `}
        </style>
      </div>
    );
  }

  if (showRingSelect) {
    return (
      <div>
        <h1>Select Ring</h1>
        {availableRings.map((r) => (
          <button
            key={r}
            onClick={() => {
              if (window.confirm(`Receive updates from Ring ${r}?`)) {
                navigate(`/judgement/${r}`);
                setShowRingSelect(false);
              }
            }}
            style={buttonStyle}
          >
            Ring {r}
          </button>
        ))}
        <button onClick={() => setShowRingSelect(false)} style={buttonStyle}>Cancel</button>
        <ConnectionIndicator />
      </div>
    );
  }

  if (!judgementData) {
    return (
      <div>
        <h1>Judgement Wait</h1>
        <p>You are judging ring {ringNumber} as {judgeName}</p>
        <button onClick={() => setShowRingSelect(true)} style={buttonStyle}>Change Ring</button>
        <ConnectionIndicator />
        <style>
          {`
            @keyframes pulse {
              0% { transform: scale(1); opacity: 0; }
              50% { transform: scale(1.4); opacity: 1; }
              100% { transform: scale(1); opacity: 0; }
            }
          `}
        </style>
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
        style={buttonStyle}
      >
        {hasCheckedValues() ? 'Submit Judgement' : 'Report No Exchange'}
      </button>
      <button
        className="judgement-submit double"
        onClick={() => handleConfirmation('Confirm Double Hit?', () => handleSubmit({ doubleHit: true }))}
        style={buttonStyle}
      >
        Double Hit
      </button>
      <ConnectionIndicator />
      <style>
        {`
          @keyframes pulse {
            0% { transform: scale(1); opacity: 0; }
            50% { transform: scale(1.4); opacity: 1; }
            100% { transform: scale(1); opacity: 0; }
          }
        `}
      </style>
    </div>
  );
};

export default JudgementManager;

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
  const [isPolling, setIsPolling] = useState(false); // Track if we are using polling
  const [judgeName, setJudgeName] = useState<string | null>(null); // Track the judge's name
  const [nameInput, setNameInput] = useState(''); // Input state for the judge's name
  const maxRetries = 3; // Maximum number of SSE reconnection attempts
  const retryDelay = 3000; // Delay between reconnection attempts (in milliseconds)

  // Check for existing judge name in cookies or session storage
  useEffect(() => {
    const storedJudgeName = getCookie('judgeName') || sessionStorage.getItem('judgeName');
    if (storedJudgeName) {
      setJudgeName(storedJudgeName);
    }
  }, []);

  const handleNameSubmit = useCallback(() => {
    if (nameInput.trim()) {
      const trimmedName = nameInput.trim();
      setJudgeName(trimmedName);
      setCookie('judgeName', trimmedName, 2); // Store name in cookies for 2 days
      sessionStorage.setItem('judgeName', trimmedName); // Store name in session storage
    }
  }, [nameInput]);

  // Polling fallback function
  const pollForUpdates = useCallback(() => {
    setIsPolling(true); // Set polling mode to true
    const pollingInterval = setInterval(async () => {
      try {
        const response = await fetch(`${domain_uri}/requestJudgementPOLL.php`);
        const data = await response.json();
        // Handle the polling data
        if (data) {
          setJudgementData(data);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollingInterval); // Clear interval on cleanup
  }, []);

  const connectToSSE = useCallback(
    (retriesLeft: number) => {
      if (typeof EventSource !== 'undefined') {
        const eventSource = new EventSource(`${domain_uri}/requestJudgementSSE.php`);

        eventSource.onmessage = (event) => {
          if (event.data) {
            try {
              const data: JudgementData | null = JSON.parse(event.data);
              if (data === null) {
                console.log('Initial connection established.');
              } else {
                console.log('Received judgement request:', data);

                const initialScores = {
                  [data.fighter1Id]: {
                    contact: false,
                    target: false,
                    control: false,
                    afterBlow: false,
                    opponentSelfCall: false,
                  },
                  [data.fighter2Id]: {
                    contact: false,
                    target: false,
                    control: false,
                    afterBlow: false,
                    opponentSelfCall: false,
                  },
                };

                setJudgementData(data);
                setScores(initialScores);
                retriesLeft = 3;
              }
            } catch (error) {
              console.error('Error parsing SSE data:', error);
            }
          }
        };

        eventSource.onerror = (error) => {
          console.error('SSE connection error:', error);
          eventSource.close();
          if (retriesLeft > 0) {
            console.log(`Retrying SSE connection... (${retriesLeft} retries left)`);
            setTimeout(() => connectToSSE(retriesLeft - 1), retryDelay);
          } else {
            console.log('SSE failed after maximum retries. Switching to polling.');
            pollForUpdates();
          }
        };

        return eventSource;
      } else {
        // Fallback to polling if SSE is not supported
        pollForUpdates();
        return null;
      }
    },
    [pollForUpdates]
  );

  useEffect(() => {
    const eventSource = connectToSSE(maxRetries);

    return () => {
      if (eventSource) eventSource.close();
    };
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

  const handleSubmit = useCallback(
    async (action: { fighterId?: number; opponentId?: number; doubleHit?: boolean }) => {
      if (judgementData && judgeName) {
        const data = {
          matchId: judgementData.matchId,
          boutId: judgementData.boutId,
          scores: {
            [judgementData.fighter1Id]: {
              contact: scores[judgementData.fighter1Id]?.contact || false,
              target: scores[judgementData.fighter1Id]?.target || false,
              control: scores[judgementData.fighter1Id]?.control || false,
              afterBlow: action.fighterId === judgementData.fighter1Id && action.doubleHit === false ? true : false,
              opponentSelfCall: action.opponentId === judgementData.fighter1Id ? true : false,
              doubleHit: action.doubleHit || false,
              judgeName: judgeName,
            },
            [judgementData.fighter2Id]: {
              contact: scores[judgementData.fighter2Id]?.contact || false,
              target: scores[judgementData.fighter2Id]?.target || false,
              control: scores[judgementData.fighter2Id]?.control || false,
              afterBlow: action.fighterId === judgementData.fighter2Id && action.doubleHit === false ? true : false,
              opponentSelfCall: action.opponentId === judgementData.fighter2Id ? true : false,
              doubleHit: action.doubleHit || false,
              judgeName: judgeName,
            },
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

  // Move fighter1 and fighter2 outside of the conditional rendering block
  const fighter1 = useMemo(
    () =>
      judgementData
        ? {
            fighterId: judgementData.fighter1Id,
            fighterName: judgementData.fighter1Name,
            fighterColor: judgementData.fighter1Color,
          }
        : null,
    [judgementData]
  );

  const fighter2 = useMemo(
    () =>
      judgementData
        ? {
            fighterId: judgementData.fighter2Id,
            fighterName: judgementData.fighter2Name,
            fighterColor: judgementData.fighter2Color,
          }
        : null,
    [judgementData]
  );

  if (!judgeName) {
    return (
      <div>
        <h1>Enter Your Name</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleNameSubmit();
          }}
        >
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
        {ringNumber && <p>You are judging ring {ringNumber} as {judgeName}</p>}
      </div>
    );
  } else {
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
              onSubmit={handleSubmit} // Pass handleSubmit to ScoreTable
            />
            <ScoreTable
              fighter={fighter2}
              opponent={fighter1}
              scores={scores[fighter2.fighterId] || {}}
              onCheckboxChange={handleCheckboxChange}
              onSubmit={handleSubmit} // Pass handleSubmit to ScoreTable
            />
          </>
        )}
        <button className="judgement-submit" onClick={() => handleSubmit({})}>
          Submit Judgement
        </button>
        <button className="judgement-submit double" onClick={() => handleSubmit({ doubleHit: true })}>
          Double Hit
        </button>
        {isPolling && <aside>fallback: polling</aside>} {/* Show aside only when polling */}
      </div>
    );
  }
};

export default JudgementManager;

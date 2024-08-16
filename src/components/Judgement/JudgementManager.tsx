import React, { useEffect, useState, useCallback } from 'react';
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

  const handleNameSubmit = () => {
    if (nameInput.trim()) {
      setJudgeName(nameInput.trim());
      setCookie('judgeName', nameInput.trim(), 2); // Store name in cookies for 2 days
      sessionStorage.setItem('judgeName', nameInput.trim()); // Store name in session storage
    }
  };

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

  const connectToSSE = useCallback((retriesLeft: number) => {
    if (typeof EventSource !== 'undefined') {
      const eventSource = new EventSource(`${domain_uri}/requestJudgementSSE.php`);

      eventSource.onmessage = (event) => {
        if (event.data) {
          try {
            const data: JudgementData | null = JSON.parse(event.data);
            if (data === null) {
              console.log("Initial connection established.");
            } else {
              console.log("Pending judges count increased:", data);

              const initialScores = Object.values(data.Bouts).reduce(
                (acc: Record<number, Record<string, boolean>>, bout: Bout) => {
                  acc[bout.fighterId] = {
                    contact: false,
                    quality: false,
                    control: false,
                    afterBlow: false,
                    opponentSelfCall: false,
                  };
                  return acc;
                },
                {} as Record<number, Record<string, boolean>>
              );

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
  }, [pollForUpdates]);

  useEffect(() => {
    const eventSource = connectToSSE(maxRetries);

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [connectToSSE]);

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
    if (judgementData && judgeName) {
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
            judgeName: judgeName
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

  if (!judgeName) {
    return (
      <div>
        <h1>Enter Your Name</h1>
        <form onSubmit={(e) => {
          e.preventDefault();
          handleNameSubmit();
        }}>
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
        {isPolling && <aside>fallback: polling</aside>} {/* Show aside only when polling */}
      </div>
    );
  }
};

export default JudgementManager;

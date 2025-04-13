/**
 *  src/components/Judgement/JudgementManager.tsx
 * 
 * == Judgement Manager ==
 * This is the parent component used by judges to judge an exchange on their phone. 
 * 
 * 'Judgement' is used to describe the process of a judge submitting scores for a bout
 * after receiving the signal to do so. 'Judgement' sounds amusingly dramatic.
 * 
 * Judges input their names before submitting Judgement. 
 * This is used on the backend to ensure that duplicate scoring submissions are not recorded.
 * If a judge needs another signal, all judges must submit scores again even if they have done so 
 * already as this ensures their screen will be ready again. Duplicates will be ignored. 
 *                                                                                                                                                                                                                      
 * Uses SSE to listen for the signal from the server that Judgement is at hand, which presents judges with a score
 * card for the fighters of a specific ring. Fighter names and colors are shown. Judgement is sent to the server.
 * 
 * Memoization and callbacks are used to optimize performance.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { domain_uri } from '../utility/contants';
import ScoreTable from './ScoreTable';

/**
 * Retrieve Judge name stored in cookie. 
 *
 * @param {string} name - The name of the cookie.
 * @returns {string | undefined} The cookie value, or undefined if not found.
 */
const getCookie = (name: string) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
};

/**
 * Set Judge name and store as a cookie. 
 *
 * @param {string} name - The name of the cookie.
 * @returns {string | undefined} The cookie value, or undefined if not found.
 */
const setCookie = (name: string, value: string, days: number) => {
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/`;
};

/** Structure of Judgement data received from SSE */
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

/**
 * The JudgementManager component handles Judgement by Judges.
 *
 * @returns {JSX.Element} The rendered component.
 */
const JudgementManager: React.FC = () => {

  //Initialize state and contexts
  const { ringNumber } = useParams<{ ringNumber: string }>();
  const [judgementData, setJudgementData] = useState<JudgementData | null>(null);
  const [scores, setScores] = useState<Record<number, Record<string, boolean>>>({});
  const [judgeName, setJudgeName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const maxRetries = 3;
  const retryDelay = 3000;

  /** Retrieve stored judge name from cookies or session storage on mount */
  useEffect(() => {
    const storedJudgeName = getCookie('judgeName') || sessionStorage.getItem('judgeName');
    if (storedJudgeName) setJudgeName(storedJudgeName);
  }, []);

  /** Handles when a judge submits their name. Uses callback to memoise Judge name to state and store as session cookie.*/
  const handleNameSubmit = useCallback(() => {
    if (nameInput.trim()) {
      const trimmedName = nameInput.trim();
      setJudgeName(trimmedName);
      setCookie('judgeName', trimmedName, 2);
      sessionStorage.setItem('judgeName', trimmedName);
    }
  }, [nameInput]);

  /**
   * Listens for the signal from the server that indicates when a score needs to be submitted.
   * Uses callback to memoize data and avoid re-renders of existing data.
   * 
   * Will be called again up to retriesLeft to retry connection to SSE if it fails.
   */
  const connectToSSE = useCallback((retriesLeft: number) => {

    //SSE endpoint listening for signal to start Judgement. Obtains ring number from url in react router.
    const eventSource = new EventSource(`${domain_uri}/requestJudgementSSE.php?ringNumber=${ringNumber}`);

    //Handle incoming data. Looks for valid event.data
    eventSource.onmessage = (event) => {
      if (event.data) {
        try {
          const data: JudgementData | null = JSON.parse(event.data);


          //if data is valid, parse to JSON setting all score fields to unchecked (i.e. false) 
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

    //if connection to SSE fails, try reconnecting, then decrement retriedLeft.
    eventSource.onerror = () => {
      eventSource.close();
      if (retriesLeft > 0) {
        setTimeout(() => connectToSSE(retriesLeft - 1), retryDelay);
      }
    };

    return eventSource;
  }, []);


  // Effect hook called on component mount to handle connection to SSE
  useEffect(() => {
    const eventSource = connectToSSE(maxRetries);
    return () => eventSource.close();
  }, [connectToSSE]);


  //Allows judge to clear scores, otherwise update scores for fighter
  const handleCheckboxChange = useCallback((fighterId: number, criteria: string) => {
    if (criteria === 'clear') {
      // Reset all scores for the given fighter
      setScores((prevScores) => ({
        ...prevScores,
        [fighterId]: {
          contact: false,
          target: false,
          control: false,
          afterBlow: false,
          opponentSelfCall: false,
        },
      }));
    } else {
      // Update the specific score criteria for the given fighter
      setScores((prevScores) => ({
        ...prevScores,
        [fighterId]: {
          ...prevScores[fighterId],
          [criteria]: !prevScores[fighterId]?.[criteria],
        },
      }));
    }
  }, []);
  
  //Simple confirmation widow for when judgement is submitted.
  const handleConfirmation = (message: string, action: () => void) => {
    if (window.confirm(message)) {
      action();
    }
  };

  //Returns true if any score field is checked. Used to determine if there was no exchange.
  const hasCheckedValues = useCallback(() => {
    return (
      Object.values(scores[judgementData?.fighter1Id || 0] || {}).some(Boolean) ||
      Object.values(scores[judgementData?.fighter2Id || 0] || {}).some(Boolean)
    );
  }, [scores, judgementData]);

  /**
   * This is called when a Judge submits Judgement. 
   * Builds the score payload for fighter1 and fighter2 then submits to endpoint on backend.
   * Has a separate button for declaring doubles.
  */
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

        //same payload construction for fighter 2
        const fighter2Scores = {
          contact: action.doubleHit === undefined ? scores[judgementData.fighter2Id]?.contact || false : false,
          target: action.doubleHit === undefined ? scores[judgementData.fighter2Id]?.target || false : false,
          control: action.doubleHit === undefined ? scores[judgementData.fighter2Id]?.control || false : false,
          afterBlow: action.fighterId === judgementData.fighter2Id && action.doubleHit === false ? true : false,
          opponentSelfCall: action.opponentId === judgementData.fighter2Id ? true : false,
          doubleHit: action.doubleHit || false,
          judgeName: judgeName,
        };

        //final payload to send to server.
        const data = {
          matchId: judgementData.matchId,
          boutId: judgementData.boutId,
          scores: {
            [judgementData.fighter1Id]: fighter1Scores,
            [judgementData.fighter2Id]: fighter2Scores,
          },
        };

        //submit payload to server asyncronously.
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

  //Memoize fighter1 data for use in score display.
  const fighter1 = useMemo(() => judgementData ? {
    fighterId: judgementData.fighter1Id,
    fighterName: judgementData.fighter1Name,
    fighterColor: judgementData.fighter1Color,
  } : null, [judgementData]);

  ///Memoize fighter2 data for use in score display.
  const fighter2 = useMemo(() => judgementData ? {
    fighterId: judgementData.fighter2Id,
    fighterName: judgementData.fighter2Name,
    fighterColor: judgementData.fighter2Color,
  } : null, [judgementData]);

  //HTML that will render if a judge has not entered a name. Asks judge to enter their name.
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

  //HTML that will render when waiting for Judgement to commence. Will commence when Judgement data is received.
  if (!judgementData) {
    return (
      <div>
        <h1>Judgement Wait</h1>
        <p>You are judging ring {ringNumber} as {judgeName}</p>
      </div>
    );
  }

  //HTML that will render for Judgement. 
  //Uses 2 ScoreTable components: one for each fighter.
  //Should only display when judge name and Judgement data are present.
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

import React, { useCallback, useState, useEffect, useRef } from 'react';
import { domain_uri } from '../../utility/contants';
import { useToast } from '../../utility/ToastProvider';

interface TriggerJudgementProps {
  matchId: number;
  refresh: boolean; // Determines whether to show the timer or refresh button
}

const TriggerJudgement: React.FC<TriggerJudgementProps> = ({ matchId, refresh }) => {
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(60); // Timer starts at 60.0 seconds
  const [isRunning, setIsRunning] = useState(false); // State to toggle start/stop for the timer
  const intervalRef = useRef<number | null>(null); // Use ref to hold interval ID
  const addToast = useToast(); // Use the toast hook to trigger toast notifications

  // Function to start the timer countdown
  const startTimer = useCallback(() => {
    if (!isRunning) {
      setIsRunning(true); // Set to running state only if not already running
    }
  }, [isRunning]);

  // Function to stop the timer and trigger judgement
  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current); // Clear the interval to stop the timer
    }
    setIsRunning(false); // Stop the timer
    triggerJudgement(); // Trigger the judgement when "Stop" is pressed
  }, []);

  // Handle the countdown
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        setTimer((prev) => prev - 0.1); // Subtract 0.1 second per interval (100ms)
      }, 100); // Update every 100ms for one decimal place precision

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current); // Cleanup interval on unmount or stop
      };
    }
  }, [isRunning]);

  // Prevent the timer from resetting when the component re-renders
  useEffect(() => {
    if (refresh) {
      // Don't reset the timer when 'refresh' is true
      return;
    }

    // Only initialize the timer when the component is first mounted
    setTimer(60); // Set the initial value to 60 only on first mount
  }, [refresh]); // Dependency is only 'refresh', so it doesn't reset on state changes

  // Memoized function to trigger the judgement when the timer is stopped
  const triggerJudgement = useCallback(async () => {
    if (loading) return; // Prevent multiple clicks during the loading state

    setLoading(true);
    try {
      const endpoint = `${domain_uri}/receiveJudgementRequest.php`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ matchId }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      addToast('Judgement triggered successfully.'); // Trigger a success toast
    } catch (error) {
      console.error('Error triggering judgement:', error);
      addToast('An error occurred while processing the judgement. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [matchId, loading, addToast]);

  // Separate function for refreshing judgement
  const refreshJudgement = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = `${domain_uri}/refreshJudgement.php`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ matchId }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      addToast('Judgement refreshed successfully.'); // Trigger a success toast
    } catch (error) {
      console.error('Error refreshing judgement:', error);
      addToast('Error refreshing judgement.');
    } finally {
      setLoading(false);
    }
  }, [matchId, addToast]);

  // Function to format the timer to 1 decimal place
  const formatTime = (time: number) => {
    return time.toFixed(1); // Display the timer with one decimal place
  };

  return (
    <div>
      {/* Conditional Rendering based on the 'refresh' prop */}
      {refresh ? (
        <button onClick={refreshJudgement} disabled={loading}>
          Refresh Judgement
        </button>
      ) : (
        <button onClick={isRunning ? stopTimer : startTimer} disabled={loading}>
          {isRunning ? `Stop (${formatTime(timer)}s)` : `Start (${formatTime(timer)}s)`}
        </button>
      )}

      {loading && <p>Loading...</p>} {/* Optional loading indicator */}
    </div>
  );
};

export default React.memo(TriggerJudgement);

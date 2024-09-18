import React, { useCallback, useState } from 'react';
import { domain_uri } from '../../utility/contants';

// Debounce function to prevent multiple rapid clicks
const debounce = (func: Function, delay: number) => {
  let timeoutId: any;
  return (...args: any[]) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
};

interface TriggerJudgementProps {
  matchId: number;
  refresh: boolean;
}

const TriggerJudgement: React.FC<TriggerJudgementProps> = ({ matchId, refresh }) => {
  const [loading, setLoading] = useState(false);

  // Memoized handleButtonClick function with error handling and loading state
  const handleButtonClick = useCallback(async () => {
    if (loading) return; // Prevent multiple clicks during the loading state

    setLoading(true);
    try {
      const endpoint = refresh
        ? `${domain_uri}/refreshJudgement.php`
        : `${domain_uri}/receiveJudgementRequest.php`;

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

      console.log(refresh ? 'Judgement refreshed successfully.' : 'Judgement triggered successfully.');
      //alert(refresh ? 'Judgement refreshed successfully.' : 'Judgement triggered successfully.');
    } catch (error) {
      console.error('There was a problem with the fetch operation:', error);
      //alert('An error occurred while processing the judgement. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [matchId, refresh, loading]);

  // Debounce the button click to avoid rapid multiple clicks
  const debouncedHandleButtonClick = useCallback(debounce(handleButtonClick, 300), [handleButtonClick]);

  return (
    <div>
      <button onClick={debouncedHandleButtonClick} disabled={loading}>
        {refresh ? 'Refresh Judgement' : 'Begin Judgement'}
      </button>
      {loading && <p>Loading...</p>} {/* Optional loading indicator */}
    </div>
  );
};

// Memoize the entire component to prevent unnecessary re-renders
export default React.memo(TriggerJudgement);

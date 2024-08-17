import React from 'react';
import { domain_uri } from '../../utility/contants';

interface TriggerJudgementProps {
  matchId: number;
  refresh: boolean; 
}

const TriggerJudgement: React.FC<TriggerJudgementProps> = ({ matchId, refresh }) => {
  // Handle button click
  const handleButtonClick = async () => {
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
    } catch (error) {
      console.error('There was a problem with the fetch operation:', error);
    }
  };

  return (
    <div>
      <button onClick={handleButtonClick}>
        {refresh ? 'Refresh Judgement' : 'Begin Judgement'}
      </button>
    </div>
  );
};

export default TriggerJudgement;

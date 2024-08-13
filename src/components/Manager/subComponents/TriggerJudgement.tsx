import React from 'react';
import { domain_uri } from '../../utility/contants';

interface TriggerJudgementProps {
  matchId: number;
}

const TriggerJudgement: React.FC<TriggerJudgementProps> = ({ matchId }) => {
  // Handle button click
  const handleButtonClick = async () => {
    try {
      const response = await fetch(`${ domain_uri }/receiveJudgementRequest.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ matchId }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      console.log('Judgement triggered successfully.');
    } catch (error) {
      console.error('There was a problem with the fetch operation:', error);
    }
  };

  return (
    <div>
      <button onClick={handleButtonClick}>
        Begin Judgement
      </button>
    </div>
  );
};

export default TriggerJudgement;

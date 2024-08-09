import React from 'react';
import { domain_uri } from '../contants';

interface TriggerJudgementProps {
  data: {
    matchId: number,
    fighters: [
      {
        fighter1id: number,
        fighter1name: string,
        fighter1color: string,
      },
      {
        fighter2id: number,
        fighter2name: string,
        fighter2color: string,
      },
    ],
  };
}

const TriggerJudgement: React.FC<TriggerJudgementProps> = ({ data }) => {
  // Handle button click
  const handleButtonClick = async () => {
    try {
      const response = await fetch(`${domain_uri}/triggerJudgement.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
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

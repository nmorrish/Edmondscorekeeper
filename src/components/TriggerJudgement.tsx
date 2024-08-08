// TriggerJudgement.tsx

import React, { useEffect, useState } from 'react';

interface TriggerJudgementProps {
  data: {
    judgement: string;
  };
}

const TriggerJudgement: React.FC<TriggerJudgementProps> = ({ data }) => {
  const [judgementData, setJudgementData] = useState<string | null>(null);

  useEffect(() => {
    // Establish connection to the SSE server
    const eventSource = new EventSource('http://localhost/Edmondscorekeeper/triggerJudgement.php');

    // Handle incoming messages
    eventSource.onmessage = (event) => {
      const receivedData = JSON.parse(event.data);
      setJudgementData(receivedData.judgement);
    };

    // Handle connection errors
    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      eventSource.close();
    };

    // Clean up the event source on component unmount
    return () => {
      eventSource.close();
    };
  }, []);

  // Handle button click
  const handleButtonClick = () => {
    console.log('Sending data to the server:', data);
    // Here, you can send data to the server or perform other actions
  };

  return (
    <div>
      <button onClick={handleButtonClick}>
        {`Judgement: ${data.judgement}`}
      </button>
      {judgementData && (
        <div>
          <h2>Received Judgement</h2>
          <p><strong>Judgement:</strong> {judgementData}</p>
        </div>
      )}
    </div>
  );
};

export default TriggerJudgement;
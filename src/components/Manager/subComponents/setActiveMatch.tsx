import React, { useState } from 'react';
import { domain_uri } from "../../utility/contants";
import { useToast } from '../../utility/ToastProvider';
import { useRefresh } from '../../utility/RefreshContext'; // Import useRefresh to trigger the refresh

interface SetActiveMatchButtonProps {
  matchId: number; // The ID of the match that should be set as active
}

const SetActiveMatchButton: React.FC<SetActiveMatchButtonProps> = ({ matchId }) => {
  const [loading, setLoading] = useState(false);
  const addToast = useToast(); // Initialize the toast
  const { triggerRefresh } = useRefresh(); // Get triggerRefresh from the context

  const handleSetActiveMatch = async () => {
    setLoading(true);

    try {
      const response = await fetch(`${domain_uri}/setActiveMatch.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ matchId }), // Send the matchId in the request body
      });

      const data = await response.json();

      if (data.status === 'success') {
        addToast("Match set to active");

        // Trigger a refresh after successfully setting the active match
        triggerRefresh(); 
      } else {
        addToast(`Error: ${data.message}`);
      }
    } catch (error) {
      addToast('An error occurred while setting the match as active.');
      console.error('Error setting active match:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleSetActiveMatch} disabled={loading}>
        {loading ? 'Setting Active...' : 'Set Match Active'}
      </button>
    </div>
  );
};

export default SetActiveMatchButton;

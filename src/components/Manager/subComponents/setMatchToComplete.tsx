import React, { useState } from 'react';
import { domain_uri } from "../../utility/contants";
import { useToast } from '../../utility/ToastProvider';
import { useRefresh } from '../../utility/RefreshContext'; // Import useRefresh to trigger the refresh

interface SetCompleteMatchButtonProps {
  matchId: number; // The ID of the match that should be marked as complete
}

const SetCompleteMatchButton: React.FC<SetCompleteMatchButtonProps> = ({ matchId }) => {
  const [loading, setLoading] = useState(false);
  const addToast = useToast(); // Initialize the toast
  const { triggerRefresh } = useRefresh(); // Get triggerRefresh from the context

  const handleSetCompleteMatch = async () => {
    setLoading(true);

    try {
      const response = await fetch(`${domain_uri}/setMatchToComplete.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ matchId }), // Send the matchId in the request body
      });

      const data = await response.json();

      if (data.status === 'success') {
        addToast("Match marked as complete");

        // Trigger a refresh after successfully marking the match as complete
        triggerRefresh(); 
      } else {
        addToast(`Error: ${data.message}`);
      }
    } catch (error) {
      addToast('An error occurred while marking the match as complete.');
      console.error('Error marking match as complete:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleSetCompleteMatch} disabled={loading}>
        {loading ? 'Marking Complete...' : 'Mark Match Complete'}
      </button>
    </div>
  );
};

export default SetCompleteMatchButton;

import React, { useState } from 'react';
import { domain_uri } from "../../utility/contants";
import { useToast } from '../../utility/ToastProvider';
import { useRefresh } from '../../utility/RefreshContext';

interface IncrementFighterStrikeButtonProps {
  fighterId: number;
}

const IncrementFighterStrikeButton: React.FC<IncrementFighterStrikeButtonProps> = ({ fighterId }) => {
  const [loading, setLoading] = useState(false);
  const addToast = useToast();
  const { triggerRefresh } = useRefresh();
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleIncrementStrike = async () => {
    setLoading(true);

    try {
      const response = await fetch(`${domain_uri}/strikeFighterIncrement.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fighterId }),
      });

      const data = await response.json();

      if (data.status === 'success') {
        addToast(`${data.strikes} strikes on ${data.fighterName}`);
        triggerRefresh(); // Trigger refresh after increment
      } else {
        addToast(`Error: ${data.message}`);
      }
    } catch (error) {
      addToast('An error occurred while incrementing the strike.');
      console.error('Error incrementing fighter strike:', error);
    } finally {
      setLoading(false);
      setShowConfirmation(false); // Close the confirmation dialog
    }
  };

  const confirmIncrement = () => {
    setShowConfirmation(true);
  };

  const cancelIncrement = () => {
    setShowConfirmation(false);
  };

  return (
    <>
      {showConfirmation && (
        <div className="confirmation-popup">
          <p>Assign Strike?</p>
          <button onClick={handleIncrementStrike} disabled={loading}>
            {loading ? 'Incrementing...' : 'Yes'}
          </button>
          <button onClick={cancelIncrement} disabled={loading}>
            No
          </button>
        </div>
      )}
      <button onClick={confirmIncrement} disabled={loading} className="strike-button">
        {loading ? 'XXX' : 'X'}
      </button>
    </>
  );
};

export default IncrementFighterStrikeButton;

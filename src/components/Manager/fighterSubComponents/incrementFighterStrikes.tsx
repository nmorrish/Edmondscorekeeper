import React, { useState } from "react";
import { backend_uri } from "../../utility/endpoints";
import { useToast } from "../../utility/ToastProvider";
import { apiQuery } from "../../utility/apiClient";

interface IncrementFighterStrikeButtonProps {
  fighterId: number;
  tournamentId: number;
  initialStrikes?: number;
  onStrikeUpdate?: (fighterId: number, newStrikes: number) => void; // <-- unified callback
}

const IncrementFighterStrikeButton: React.FC<IncrementFighterStrikeButtonProps> = ({
  fighterId,
  tournamentId,
  initialStrikes = 0,
  onStrikeUpdate,
}) => {
  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [currentStrikes, setCurrentStrikes] = useState(initialStrikes);
  const addToast = useToast();

  const handleIncrementStrike = async () => {
    setLoading(true);

    try {
      const response = await apiQuery(`${backend_uri}/tournamentFightersApi.php`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fighterId, tournamentId, action: "incrementStrike" }),
      });

      const data = await response.json();

      if (data.status === "success") {
        setCurrentStrikes(data.strikes);
        addToast(`${data.strikes} strikes on ${data.fighterName}`);

        // 🔹 Notify parent so FighterList updates
        if (onStrikeUpdate) {
          onStrikeUpdate(fighterId, data.strikes);
        }
      } else {
        addToast(`Error: ${data.message}`);
      }
    } catch (error) {
      addToast("An error occurred while incrementing the strike.");
      console.error("Error incrementing fighter strike:", error);
    } finally {
      setLoading(false);
      setShowConfirmation(false);
    }
  };

  return (
    <>
      {showConfirmation && (
        <div className="confirmation-popup">
          <p>Assign Strike?</p>
          <button onClick={handleIncrementStrike} disabled={loading}>
            {loading ? "Incrementing..." : "Yes"}
          </button>
          <button onClick={() => setShowConfirmation(false)} disabled={loading}>
            No
          </button>
        </div>
      )}

      <button
        onClick={() => setShowConfirmation(true)}
        disabled={loading}
        className="strike-button"
      >
        {loading ? "XXX" : "X"}
      </button>
      <span className="strike-count">
        {currentStrikes === 0 ? "" : `(${currentStrikes} strikes)`}
      </span>
    </>
  );
};

export default IncrementFighterStrikeButton;

// src/components/Manager/subComponents/MatchActions.tsx

import React from "react";
import { MatchStatus } from "./MatchCard";

interface MatchActionsProps {
  localStatus: MatchStatus;
  onSwap: () => void;
  onComplete: () => void;
  onPending: () => void;
  onDelete: () => void;
}

const MatchActions: React.FC<MatchActionsProps> = ({
  localStatus,
  onSwap,
  onComplete,
  onPending,
  onDelete,
}) => {
  const handleDeleteClick = () => {
    if (window.confirm("DANGER WARNING: Deleting a match deletes all scores for that match. Permanently. This cannot be undone!")) {
      onDelete();
    }
  };

  return (
    <div className="match-actions">
      {/* Swap fighters */}
      <button type="button" className="icon-btn" onClick={onSwap} title="Swap fighters">
        &#128472;
      </button>

      {/* Complete / Pending */}
      {localStatus === "D" ? (
        <button type="button" className="icon-btn" onClick={onPending} title="Reopen (Pending)">
          &#9675;
        </button>
      ) : (
        <button type="button" className="icon-btn" onClick={onComplete} title="Mark Complete">
          &#10003;
        </button>
      )}

      {/* Delete */}
      <button
        type="button"
        className="icon-btn delete-btn"
        onClick={handleDeleteClick}
        title="Delete match"
      >
        &#10005;
      </button>
    </div>
  );
};

export default MatchActions;

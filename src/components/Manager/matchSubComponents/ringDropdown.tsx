// src/components/Manager/subComponents/RingDropdown.tsx

import React from "react";
import { backend_uri, match_api } from "../../utility/endpoints";
import { useToast } from "../../utility/ToastProvider";

interface RingDropdownProps {
  matchId: number;
  currentRing: number;
  /** total number of rings available for this event (must be passed in by parent) */
  maxRings: number;
  interactive?: boolean;
  onChangeRing?: (matchId: number, newRing: number) => void;
}

const RingDropdown: React.FC<RingDropdownProps> = ({
  matchId,
  currentRing,
  maxRings,
  interactive = false,
  onChangeRing,
}) => {
  const addToast = useToast();

  const handleRingChange = async (newRing: number) => {
    try {
      const response = await fetch(`${backend_uri}/${match_api}?id=${matchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ringNo: newRing }),
      });

      const data = await response.json();
      if (response.ok && data.status === "success") {
        onChangeRing?.(matchId, newRing); // optimistic update handled by parent
        addToast(`Match ${matchId} moved to Ring ${newRing}`);
      } else {
        addToast("Failed to change ring.");
      }
    } catch {
      addToast("Failed to change ring.");
    }
  };

  if (!interactive) {
    return <span>Ring {currentRing}</span>;
  }

  return (
    <select
      className="ring-dropdown"
      value={currentRing}
      onChange={(e) => handleRingChange(parseInt(e.target.value))}
    >
      {Array.from({ length: maxRings }, (_, i) => i + 1).map((ring) => (
        <option key={ring} value={ring}>
          Ring {ring}
        </option>
      ))}
    </select>
  );
};

export default RingDropdown;

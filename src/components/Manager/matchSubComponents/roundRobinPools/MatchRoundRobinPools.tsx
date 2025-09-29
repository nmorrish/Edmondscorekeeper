/**
 * src/components/Manager/matchSubComponents/MatchRoundRobinPools.tsx
 *
 * === Round Robin Pools (Parent) ===
 * Coordinates generator + editor
 */

import React, { useState, useEffect } from "react";
import MatchRoundRobinPoolsGenerator from "./RoundRobinPoolGenerator";
import MatchRoundRobinPoolsEditor from "./MatchRoundRobinPoolsEditor";
import { Fighter } from "../../subComponents/useFighters";
import { backend_uri } from "../../../utility/endpoints";

interface MatchRoundRobinPoolsProps {
  eventId: number;
  eventName?: string;
  maxRings?: number;
  fighters?: Fighter[];
  isActive: boolean; // true if Pools table has entries for this event
}

const MatchRoundRobinPools: React.FC<MatchRoundRobinPoolsProps> = ({
  eventId,
  eventName,
  maxRings = 1,
  fighters = [],
  isActive,
}) => {
  const [savedPools, setSavedPools] = useState<any[] | null>(null);

  // If pools are active, fetch them immediately
  useEffect(() => {
    if (isActive) {
      (async () => {
        try {
          const res = await fetch(
            `${backend_uri}/poolsRoundRobinApi.php?action=get&eventId=${eventId}`
          );
          const data = await res.json();
          if (data.status === "success" && data.pools) {
            setSavedPools(data.pools);
          }
        } catch (err) {
          console.error("Failed to fetch existing pools", err);
        }
      })();
    }
  }, [isActive, eventId]);

  const handleRegenerateClick = () => {
    const confirmed = window.confirm(
      `!!!DANGER WARNING!!!\n\nAre you sure? Regenerating pools will delete all current pools, matches, and scores for in progress and completed matches in ${eventName}.\n\nREPEAT: THIS DELETES ALL SCORES FOR IN PROGRESS AND COMPLETED MATCHES IN ${eventName == undefined ? "THIS EVENT" : eventName.toUpperCase()}!`
    );
    if (confirmed) {
      setSavedPools(null); // hide editor, show generator
    }
  };

  return (
    <div style={{ textAlign: "left", margin: "0 auto", maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ marginBottom: "0.5rem" }}>
          Round Robin Pools {eventName ? `— ${eventName}` : ""}
        </h2>

        {savedPools && (
          <button
            onClick={handleRegenerateClick}
            style={{
              padding: "6px 12px",
              background: "#840000ff",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Regenerate Pools
          </button>
        )}
      </div>

      {!savedPools ? (
        <MatchRoundRobinPoolsGenerator
          eventId={eventId}
          eventName={eventName}
          maxRings={maxRings}
          onSaved={setSavedPools}
        />
      ) : (
        <MatchRoundRobinPoolsEditor
          pools={savedPools}
          maxRings={maxRings}
          interactive={true}
          eventId={eventId}
        />
      )}
    </div>
  );
};

export default MatchRoundRobinPools;

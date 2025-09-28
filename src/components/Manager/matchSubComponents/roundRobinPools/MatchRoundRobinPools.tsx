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

  return (
    <div style={{ textAlign: "left", margin: "0 auto", maxWidth: 1200 }}>
      <h2 style={{ marginBottom: "0.5rem" }}>
        Round Robin Pools {eventName ? `— ${eventName}` : ""}
      </h2>

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
        />
      )}
    </div>
  );
};

export default MatchRoundRobinPools;

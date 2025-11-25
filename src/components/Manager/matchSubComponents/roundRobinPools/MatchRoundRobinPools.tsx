/**
 * src/components/Manager/matchSubComponents/MatchRoundRobinPools.tsx
 *
 * === Round Robin Pools (Parent) ===
 * Coordinates generator + editor
 */

import React, { useState, useEffect, useCallback } from "react";
import MatchRoundRobinPoolsGenerator from "./RoundRobinPoolGenerator";
import MatchRoundRobinPoolsEditor from "./MatchRoundRobinPoolsEditor";
import { Fighter } from "../../subComponents/useFighters";
import { backend_uri } from "../../../utility/endpoints";
import { apiQuery } from "../../../utility/apiClient";
import MatchSingleElimFighterManager from "../singleElim/MatchSingleElimFighterManager";

interface MatchRoundRobinPoolsProps {
  eventId: number;
  eventName?: string;
  maxRings?: number;
  fighters?: Fighter[];
  isActive: boolean; // true if Pools table has entries for this event
  readOnly: boolean;
  tournamentId: number;
}

const MatchRoundRobinPools: React.FC<MatchRoundRobinPoolsProps> = ({
  eventId,
  eventName,
  maxRings = 1,
  isActive,
  readOnly = false,
  tournamentId,
}) => {
  const [savedPools, setSavedPools] = useState<any[] | null>(null);

  // track which menu button was last clicked
  const [activeMenu, setActiveMenu] = useState<string>(() => {
    return localStorage.getItem(`poolsMenu-${eventId}`) || "";
  });

  useEffect(() => {
    if (activeMenu) {
      localStorage.setItem(`poolsMenu-${eventId}`, activeMenu);
    }
  }, [activeMenu, eventId]);

  // modal for managing event fighters (before pools exist)
  const [showEventFighterManager, setShowEventFighterManager] = useState(false);

  // Reusable fetch function
  const fetchPools = useCallback(async () => {
    if (!isActive) return;
    try {
      const res = await apiQuery(
        `${backend_uri}/poolsRoundRobinApi.php?action=get&eventId=${eventId}`
      );
      const data = await res.json();
      if (data.status === "success" && data.pools) {
        setSavedPools(data.pools);
      }
    } catch (err) {
      console.error("Failed to fetch existing pools", err);
    }
  }, [isActive, eventId]);

  // On mount
  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  const handleRegenerateClick = () => {
    setSavedPools(null); // hide editor, show generator
    setActiveMenu("regenerate");
  };

  const handleRefreshClick = () => {
    fetchPools(); // just reload pools data
    setActiveMenu("refresh");
  };

  console.log(readOnly);

  return (
    <div style={{ textAlign: "left", margin: "0 auto", maxWidth: 1200 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2 style={{ marginBottom: "0.5rem" }}>
          Round Robin Pools {eventName ? `— ${eventName}` : ""}
        </h2>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleRefreshClick}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border:
                activeMenu === "refresh"
                  ? "2px solid #0af"
                  : "1px solid #666",
              background: activeMenu === "refresh" ? "#222" : "#1b1b1b",
              color: "white",
              cursor: "pointer",
            }}
          >
            Refresh View
          </button>

          {/* NEW: Manage Event Fighters — only when pools are being generated */}
          {!savedPools && !readOnly && (
            <button
              onClick={() => setShowEventFighterManager(true)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #666",
                background: "#1b1b1b",
                color: "white",
                cursor: "pointer",
              }}
            >
              Manage Event Fighters
            </button>
          )}

          {savedPools && !readOnly && (
            <button
              onClick={handleRegenerateClick}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border:
                  activeMenu === "regenerate"
                    ? "2px solid #0af"
                    : "1px solid transparent",
                background: "#840000ff",
                color: "white",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              Regenerate Pools
            </button>
          )}
        </div>
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
          interactive={!readOnly}
          eventId={eventId}
          tournamentId={tournamentId}
        />
      )}

      {/* Modal reusing Single Elim fighter manager */}
      {showEventFighterManager && (
        <MatchSingleElimFighterManager
          eventId={eventId}
          tournamentId={tournamentId}
          onClose={() => setShowEventFighterManager(false)}
        />
      )}
    </div>
  );
};

export default MatchRoundRobinPools;

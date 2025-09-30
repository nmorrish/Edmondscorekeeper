/**
 * src/components/Manager/matchSubComponents/MatchSingleElimGenerator.tsx
 *
 * === Single Elimination Bracket Generator ===
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { backend_uri, single_elimination_api } from "../../../utility/endpoints";
import { useToast } from "../../../utility/ToastProvider";
import useFighters, { Fighter } from "../../subComponents/useFighters";
import MatchSingleElimFighterManager from "./MatchSingleElimFighterManager";
import ErrorBoundary from "../../../utility/ErrorBoundary";
import { safeParseJson, sanitizeFighters } from "../../../utility/dataGuards";

interface MatchSingleElimGeneratorProps {
  eventId: number;
  maxRings: number;
  onCreated: (payload: any) => void;
  tournamentId: number;
}

const eliminationApi = `${backend_uri}/${single_elimination_api}`;

const MatchSingleElimGenerator: React.FC<MatchSingleElimGeneratorProps> = ({
  eventId,
  maxRings,
  onCreated,
  tournamentId,
}) => {
  const addToast = useToast();
  const { fighters: fetchedFighters, fetchFighterData } = useFighters();
  const [loading, setLoading] = useState(false);
  const [withBronze, setWithBronze] = useState(true);
  const [localMaxRings, setLocalMaxRings] = useState<number>(
    Math.max(1, maxRings || 1)
  );
  const [showManager, setShowManager] = useState(false);
  const [localFighters, setLocalFighters] = useState<Fighter[]>([]);

  // Load fighters whenever eventId changes
  useEffect(() => {
    setLocalFighters([]); // clear stale
    (async () => {
      try {
        await fetchFighterData(eventId);
      } catch (err: any) {
        addToast(`Error fetching fighters: ${err.message || err}`);
      }
    })();
  }, [eventId, fetchFighterData, addToast]);

  // Sync fetched fighters into local state
  useEffect(() => {
    if (Array.isArray(fetchedFighters)) {
      setLocalFighters(sanitizeFighters(fetchedFighters));
    }
  }, [fetchedFighters]);

  const fighterIds = useMemo<number[]>(
    () =>
      localFighters
        .map((f) => Number(f.FighterId))
        .filter((id): id is number => Number.isInteger(id) && id > 0),
    [localFighters]
  );

  const handleCreate = useCallback(async () => {
    if (fighterIds.length < 1) {
      addToast("Add at least 1 fighter to create a bracket.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        action: "create",
        eventId,
        tournamentId,
        bracketFormat: "S",
        fighters: fighterIds,
        maxPools: Math.max(1, localMaxRings),
        withBronze: !!withBronze,
      };

      const res = await fetch(eliminationApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const bodyText = await res.text().catch(() => null);
      const data = safeParseJson(bodyText);

      if (!data || data?.status !== "success") {
        throw new Error(
          data?.message ||
            `Bracket creation failed (status ${res.status}): ${
              typeof bodyText === "string"
                ? bodyText.slice(0, 200)
                : "(no body)"
            }`
        );
      }

      const totalMatches = Object.values<any>(data.rounds || {}).reduce(
        (acc: number, arr: any) =>
          acc + (Array.isArray(arr) ? arr.length : 0),
        0
      );

      addToast(
        `Created bracket with ${totalMatches} matches across ${
          Object.keys(data.rounds || {}).length
        } columns.`
      );

      try {
        onCreated(data);
      } catch (cbErr: any) {
        addToast(`Error in parent callback: ${cbErr.message || cbErr}`);
      }
    } catch (err: any) {
      addToast(`Error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }, [
    addToast,
    eventId,
    fighterIds,
    localMaxRings,
    onCreated,
    withBronze,
    tournamentId,
  ]);

  return (
    <ErrorBoundary>
      <div
        className="se-generator"
        style={{ border: "1px dashed #666", borderRadius: 10, padding: 12 }}
      >
        <h3 style={{ marginTop: 0 }}>Create Single-Elimination Bracket</h3>

        <div style={{ display: "grid", gap: 12 }}>
          {/* Fighters + Manage button */}
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span style={{ fontWeight: 600 }}>Fighters in Event</span>
              <button
                onClick={() => setShowManager(true)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "1px solid #666",
                  background: "#1b1b1b",
                  cursor: "pointer",
                }}
              >
                Manage Fighters
              </button>
            </div>

            {localFighters.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No fighters found for this event.</div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                {localFighters.map((f) => (
                  <div
                    key={String(f.FighterId)}
                    style={{
                      border: "1px solid #444",
                      borderRadius: 8,
                      padding: 8,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{f.FighterName}</div>
                    {f.ClubName ? (
                      <div style={{ opacity: 0.75, fontSize: 12 }}>
                        {f.ClubName}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Controls */}
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={withBronze}
                onChange={(e) => setWithBronze(e.target.checked)}
              />
              Include Bronze Match
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Max Rings:
              <input
                type="number"
                min={1}
                value={localMaxRings}
                onChange={(e) =>
                  setLocalMaxRings(Math.max(1, Number(e.target.value) || 1))
                }
                style={{
                  width: 80,
                  padding: "4px 6px",
                  borderRadius: 6,
                  border: "1px solid #666",
                  background: "transparent",
                  color: "inherit",
                }}
              />
            </label>

            <button
              onClick={handleCreate}
              disabled={loading || fighterIds.length === 0}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #666",
                cursor: "pointer",
                background: "#1b1b1b",
              }}
              title={
                fighterIds.length === 0 ? "Add fighters first" : "Create bracket"
              }
            >
              {loading ? "Creating..." : "Create Bracket"}
            </button>
          </div>
        </div>

        {/* Modal */}
        {showManager && (
          <MatchSingleElimFighterManager
            eventId={eventId}
            tournamentId={tournamentId}
            onClose={() => setShowManager(false)}
          />
        )}
      </div>
    </ErrorBoundary>
  );
};

export default MatchSingleElimGenerator;

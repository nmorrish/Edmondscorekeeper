/**
 * src/components/Manager/matchSubComponents/MatchRoundRobinPoolsEditor.tsx
 *
 * === Round Robin Pools Editor / Viewer ===
 * Displays saved pools and their matches using MatchCard,
 * with collapsible pool sections and fighter swap support.
 */

import React, { useEffect, useMemo, useState } from "react";
import MatchCard, { MatchStatus } from "../MatchCard";
import FighterSwapInterface, {
  Fighter as SwapFighter,
  PoolPlan,
} from "./FighterSwapInterface";
import { Fighter as FullFighter } from "../../subComponents/useFighters";
import { backend_uri, round_robin_pool_api } from "../../../utility/endpoints";
import { useToast } from "../../../utility/ToastProvider";

type MatchFighter = SwapFighter & {
  FighterColor: string;
  ClubId?: number | null;
  ClubName?: string | null;
};

interface PoolMatch {
  matchId: number;
  status: MatchStatus;
  ringNo: number;
  fighters?: MatchFighter[];
}

interface PoolBlock {
  poolId: number;
  poolNo: number;
  ringAssigned: number;
  roster: FullFighter[]; // authoritative roster for swap interface
  matches: PoolMatch[];
}

interface MatchRoundRobinPoolsEditorProps {
  eventId: number;
  pools: PoolBlock[];
  maxRings: number;
  interactive?: boolean;
  allFighters?: FullFighter[];
}

const POOLS_RR_API = `${backend_uri}/${round_robin_pool_api}`;

const MatchRoundRobinPoolsEditor: React.FC<MatchRoundRobinPoolsEditorProps> = ({
  eventId,
  pools,
  maxRings,
  interactive = true,
  allFighters = [],
}) => {
  const addToast = useToast();

  // Local copy for optimistic UI updates
  const [displayPools, setDisplayPools] = useState<PoolBlock[]>(pools);
  useEffect(() => setDisplayPools(pools), [pools]);

  const [openPools, setOpenPools] = useState<Record<number, boolean>>(
    () => pools.reduce((acc, pool) => ({ ...acc, [pool.poolId]: false }), {})
  );
  const togglePool = (poolId: number) =>
    setOpenPools((prev) => ({ ...prev, [poolId]: !prev[poolId] }));

  // Build fighter directory strictly from pool rosters (authoritative source)
  const swapFighterDirectory: FullFighter[] = useMemo(() => {
    const map = new Map<number, FullFighter>();
    for (const p of displayPools) {
      for (const f of p.roster ?? []) {
        if (f?.FighterId) {
          map.set(f.FighterId, f);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.FighterName ?? "").localeCompare(b.FighterName ?? "")
    );
  }, [displayPools]);

  const fighterById = useMemo(() => {
    const map = new Map<number, FullFighter>();
    for (const f of swapFighterDirectory) {
      map.set(f.FighterId, f);
    }
    return map;
  }, [swapFighterDirectory]);

  // Build PoolPlans from roster (authoritative, not matches)
  const buildEditableFromPools = useMemo<PoolPlan[]>(
    () =>
      displayPools.map((p) => ({
        poolNo: p.poolNo,
        fighterIds: (p.roster ?? []).map((f) => f.FighterId),
      })),
    [displayPools]
  );
  const [editablePools, setEditablePools] =
    useState<PoolPlan[]>(buildEditableFromPools);
  useEffect(() => {
    setEditablePools(buildEditableFromPools);
  }, [buildEditableFromPools]);

  const handleSwapPersist = async (
    fromFighterId: number,
    toFighterId: number
  ) => {
    try {
      const res = await fetch(`${POOLS_RR_API}?action=swap`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          fromFighterId,
          toFighterId,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.status !== "success") {
        throw new Error(data.message || "Swap failed");
      }
      addToast(data.message || "Swap completed");
    } catch (err: any) {
      addToast(err.message || "Network error during swap");
    }
  };

  if (!displayPools || displayPools.length === 0) {
    return (
      <div className="container" style={{ margin: "0 auto" }}>
        <p>No pools generated yet.</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ margin: "0 auto" }}>
      <br />

      <FighterSwapInterface
        fighters={swapFighterDirectory}
        pools={editablePools}
        onSwap={(nextPools, lastSwap) => {
          setEditablePools(nextPools);
          if (!lastSwap) return;
          const { fromFighterId, toFighterId } = lastSwap;

          // Optimistically update both rosters and pending matches
          setDisplayPools((prev) =>
            prev.map((pool) => {
              // update roster
              const newRoster = pool.roster.map((f) => {
                if (f.FighterId === fromFighterId) {
                  return {
                    ...f,
                    FighterId: toFighterId,
                    FighterName:
                      fighterById.get(toFighterId)?.FighterName ?? `#${toFighterId}`,
                    ClubAcronym: fighterById.get(toFighterId)?.ClubAcronym ?? null,
                    ClubId: fighterById.get(toFighterId)?.ClubId ?? null,
                    ClubName: fighterById.get(toFighterId)?.ClubName ?? null,
                  };
                }
                if (f.FighterId === toFighterId) {
                  return {
                    ...f,
                    FighterId: fromFighterId,
                    FighterName:
                      fighterById.get(fromFighterId)?.FighterName ?? `#${fromFighterId}`,
                    ClubAcronym: fighterById.get(fromFighterId)?.ClubAcronym ?? null,
                    ClubId: fighterById.get(fromFighterId)?.ClubId ?? null,
                    ClubName: fighterById.get(fromFighterId)?.ClubName ?? null,
                  };
                }
                return f;
              });

              // update matches (only pending)
              const newMatches = pool.matches.map((m) => {
                if (m.status !== "P" || !m.fighters) return m;
                const updatedFighters = m.fighters.map((f) => {
                  if (f.FighterId === fromFighterId) {
                    const nf = fighterById.get(toFighterId);
                    return {
                      ...f,
                      FighterId: toFighterId,
                      FighterName: nf?.FighterName ?? `#${toFighterId}`,
                      ClubAcronym: nf?.ClubAcronym ?? null,
                      ClubId: nf?.ClubId ?? null,
                      ClubName: nf?.ClubName ?? null,
                    };
                  }
                  if (f.FighterId === toFighterId) {
                    const nf = fighterById.get(fromFighterId);
                    return {
                      ...f,
                      FighterId: fromFighterId,
                      FighterName: nf?.FighterName ?? `#${fromFighterId}`,
                      ClubAcronym: nf?.ClubAcronym ?? null,
                      ClubId: nf?.ClubId ?? null,
                      ClubName: nf?.ClubName ?? null,
                    };
                  }
                  return f;
                });
                return { ...m, fighters: updatedFighters };
              });

              return { ...pool, roster: newRoster, matches: newMatches };
            })
          );

          // Persist to backend
          handleSwapPersist(fromFighterId, toFighterId);
        }}
      />

      {displayPools.map((pool) => {
        const isOpen = openPools[pool.poolId];
        return (
          <div
            key={pool.poolId}
            style={{
              border: "1px solid #444",
              borderRadius: 6,
              marginBottom: "1rem",
              overflow: "hidden",
              width: "100%",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#222",
                padding: "0.5rem 1rem",
                cursor: "pointer",
              }}
              onClick={() => togglePool(pool.poolId)}
            >
              <span style={{ fontWeight: "bold", color: "#fff" }}>
                Pool {pool.poolNo} – Ring {pool.ringAssigned}
              </span>
              <button
                style={{
                  background: "none",
                  border: "none",
                  color: "#fff",
                  fontSize: "1.2rem",
                  cursor: "pointer",
                }}
              >
                {isOpen ? "Stop Editing" : "Edit"}
              </button>
            </div>

            {isOpen && (
              <div style={{ padding: "1rem" }}>
                <div className="matches-grid">
                  {pool.matches.map((m, idx) => (
                    <MatchCard
                      key={m.matchId}
                      matchId={m.matchId}
                      fighters={m.fighters ?? []}   // use the updated fighters from displayPools
                      status={m.status}
                      allFighters={swapFighterDirectory} // pass known fighters for dropdowns
                      ringNo={m.ringNo}
                      matchNumber={idx + 1}
                      maxRings={maxRings}
                      interactive={interactive}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MatchRoundRobinPoolsEditor;

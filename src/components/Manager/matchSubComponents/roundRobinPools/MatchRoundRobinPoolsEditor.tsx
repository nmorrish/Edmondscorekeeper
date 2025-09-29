/**
 * src/components/Manager/matchSubComponents/MatchRoundRobinPoolsEditor.tsx
 *
 * === Round Robin Pools Editor / Viewer ===
 * Displays saved pools and their matches using MatchCard,
 * with collapsible pool sections, fighter swap support,
 * and pool fighter add/remove management.
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
/* 🔹 NEW: useRefresh for cross-component re-fetch */
import { useRefresh } from "../../../utility/RefreshContext";

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
  /* 🔹 NEW */
  const { triggerRefresh } = useRefresh();

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

  /* ----------------------------
     Pool Fighter Management Modal
     ---------------------------- */
  const [managePoolId, setManagePoolId] = useState<number | null>(null);
  const [roster, setRoster] = useState<FullFighter[]>([]);
  const [available, setAvailable] = useState<FullFighter[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const loadCandidates = async (poolId: number) => {
    setLoadingCandidates(true);
    try {
      const res = await fetch(
        `${POOLS_RR_API}?action=candidates&eventId=${eventId}&poolId=${poolId}`
      );
      const data = await res.json();
      if (data.status === "success") {
        setRoster(data.roster || []);
        setAvailable(data.available || []);
      } else {
        addToast(data.message || "Failed to load pool candidates");
      }
    } catch {
      addToast("Error loading pool candidates");
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleAddFighter = async (fighterId: number) => {
    if (!managePoolId) return;
    const fighter = available.find((f) => f.FighterId === fighterId);
    if (!fighter) return;

    // 🔹 Optimistic update
    setRoster((prev) => [...prev, fighter]);
    setAvailable((prev) => prev.filter((f) => f.FighterId !== fighterId));
    setDisplayPools((prev) =>
      prev.map((p) =>
        p.poolId === managePoolId ? { ...p, roster: [...p.roster, fighter] } : p
      )
    );

    try {
      const res = await fetch(`${POOLS_RR_API}?action=addToPool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, poolId: managePoolId, fighterId }),
      });
      const data = await res.json();
      if (data.status !== "success") throw new Error(data.message);

      // sync authoritative response (roster + matches)
      setRoster(data.roster);
      setDisplayPools((prev) =>
        prev.map((p) =>
          p.poolId === managePoolId
            ? {
                ...p,
                roster: data.roster,
                matches: [...p.matches, ...(data.matches || [])],
              }
            : p
        )
      );

    } catch (err: any) {
      addToast(err.message || "Error adding fighter");
      // 🔹 Rollback
      setRoster((prev) => prev.filter((f) => f.FighterId !== fighterId));
      setAvailable((prev) => [...prev, fighter]);
      setDisplayPools((prev) =>
        prev.map((p) =>
          p.poolId === managePoolId
            ? { ...p, roster: p.roster.filter((f) => f.FighterId !== fighterId) }
            : p
        )
      );
    }
  };

  const handleRemoveFighter = async (fighterId: number) => {
    if (!managePoolId) return;
    const fighter = roster.find((f) => f.FighterId === fighterId);
    if (!fighter) return;

    // 🔹 Optimistic update: drop from roster and remove any pending matches containing fighter
    setRoster((prev) => prev.filter((f) => f.FighterId !== fighterId));
    setDisplayPools((prev) =>
      prev.map((p) => {
        if (p.poolId !== managePoolId) return p;
        return {
          ...p,
          roster: p.roster.filter((f) => f.FighterId !== fighterId),
          matches: p.matches.filter((m) => {
            if (m.status !== "P" || !m.fighters) return true;
            return !m.fighters.some((f) => f.FighterId === fighterId); // remove whole pending match
          }),
        };
      })
    );

    try {
      const res = await fetch(`${POOLS_RR_API}?action=removeFromPoolAndEvent`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, poolId: managePoolId, fighterId }),
      });
      const data = await res.json();
      if (data.status !== "success") throw new Error(data.message);

      // sync authoritative roster
      setRoster(data.roster);
      setDisplayPools((prev) =>
        prev.map((p) =>
          p.poolId === managePoolId ? { ...p, roster: data.roster } : p
        )
      );

      /* 🔹 NEW: force a fresh load so any server-side deletions of Matches/PoolMatches are reflected */
      triggerRefresh();
    } catch (err: any) {
      addToast(err.message || "Error removing fighter");
      // 🔹 Rollback (roster; matches were not removed on server if call failed)
      setRoster((prev) => [...prev, fighter]);
      setDisplayPools((prev) =>
        prev.map((p) =>
          p.poolId === managePoolId ? { ...p, roster: [...p.roster, fighter] } : p
        )
      );
    }
  };

  const closeManage = () => {
    setManagePoolId(null);
    setRoster([]);
    setAvailable([]);
  };

  /* ----------------------------
     Render
     ---------------------------- */

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
        onManagePool={(poolNo) => {
          const pool = displayPools.find((p) => p.poolNo === poolNo);
          if (pool) {
            setManagePoolId(pool.poolId);
            loadCandidates(pool.poolId);
          }
        }}
      />

      {/* Pool Fighter Management Modal */}
      {managePoolId && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
          onClick={closeManage}
        >
          <div
            style={{
              background: "#1e1e1e",
              padding: "1rem",
              borderRadius: 8,
              width: "90%",
              maxWidth: "800px",
              maxHeight: "80%",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Manage Pool Fighters</h3>
            {loadingCandidates ? (
              <p>Loading...</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                {/* Left: roster */}
                <div>
                  <h4>In Pool</h4>
                  {roster.length === 0 && <p>No fighters</p>}
                  {roster.map((f) => (
                    <div
                      key={f.FighterId}
                      style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}
                    >
                      <span>
                        {f.FighterName}
                        {f.ClubAcronym ? ` (${f.ClubAcronym})` : ""}
                      </span>
                      <button onClick={() => handleRemoveFighter(f.FighterId)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                {/* Right: available */}
                <div>
                  <h4>Available Fighters (not in any pool)</h4>
                  {available.length === 0 && <p>No available fighters</p>}
                  {available.map((f) => (
                    <div
                      key={f.FighterId}
                      style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}
                    >
                      <button onClick={() => handleAddFighter(f.FighterId)}>Add</button>
                      <span>
                        {f.FighterName}
                        {f.ClubAcronym ? ` (${f.ClubAcronym})` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop: "1rem", textAlign: "right" }}>
              <button onClick={closeManage}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Pool match sections */}
      {displayPools.map((pool) => {
        const isOpen = openPools[pool.poolId];

        /* 🔹 NEW: avoid rendering orphan pending matches with < 2 fighters (pre-refresh) */
        const visibleMatches = (pool.matches || []).filter(
          (m) => !(m.status === "P" && (!m.fighters || m.fighters.length < 2))
        );

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
                  {visibleMatches.map((m, idx) => (
                    <MatchCard
                      key={m.matchId}
                      matchId={m.matchId}
                      fighters={m.fighters ?? []}
                      status={m.status}
                      allFighters={swapFighterDirectory}
                      ringNo={m.ringNo}
                      matchNumber={idx + 1}
                      maxRings={maxRings}
                      interactive={interactive}
                      onDelete={(deletedId) => {
                        // 🔹 Optimistic removal from displayPools
                        setDisplayPools((prev) =>
                          prev.map((p) =>
                            p.poolId === pool.poolId
                              ? {
                                  ...p,
                                  matches: p.matches.filter(
                                    (mx) => mx.matchId !== deletedId
                                  ),
                                }
                              : p
                          )
                        );
                      }}
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

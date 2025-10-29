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
  queueNo?: number;
  fighters?: MatchFighter[];
}

interface PoolBlock {
  poolId: number;
  poolNo: number;
  ringAssigned: number | null;
  roster: FullFighter[];
  matches: PoolMatch[];
}

interface MatchRoundRobinPoolsEditorProps {
  eventId: number;
  pools: PoolBlock[];
  maxRings: number;
  interactive: boolean;
  allFighters?: FullFighter[];
  tournamentId: number;
}

const POOLS_RR_API = `${backend_uri}/${round_robin_pool_api}`;

const MatchRoundRobinPoolsEditor: React.FC<MatchRoundRobinPoolsEditorProps> = ({
  eventId,
  pools,
  maxRings,
  interactive,
  allFighters = [],
  tournamentId
}) => {
  const addToast = useToast();
  const { triggerRefresh } = useRefresh();

  const [displayPools, setDisplayPools] = useState<PoolBlock[]>(pools);
  useEffect(() => setDisplayPools(pools), [pools]);

  const [openPools, setOpenPools] = useState<Record<number, boolean>>(
    () => pools.reduce((acc, pool) => ({ ...acc, [pool.poolId]: false }), {})
  );
  const togglePool = (poolId: number) =>
    setOpenPools((prev) => ({ ...prev, [poolId]: !prev[poolId] }));

  // ----------------------- reload pools -----------------------
  const reloadPools = async () => {
    try {
      const res = await fetch(`${POOLS_RR_API}?action=get&eventId=${encodeURIComponent(eventId)}`);
      const data = await res.json();
      if (res.ok && data.status === "success" && Array.isArray(data.pools)) {
        setDisplayPools(data.pools);
      } else addToast(data.message || "Failed to refresh pools.");
    } catch {
      addToast("Network error refreshing pools.");
    }
  };

  // ----------------------- derived directories -----------------------
  const swapFighterDirectory = useMemo(() => {
    const map = new Map<number, FullFighter>();
    for (const p of displayPools) for (const f of p.roster ?? []) if (f?.FighterId) map.set(f.FighterId, f);
    return Array.from(map.values()).sort((a, b) =>
      (a.FighterName ?? "").localeCompare(b.FighterName ?? "")
    );
  }, [displayPools]);

  const fighterById = useMemo(() => {
    const map = new Map<number, FullFighter>();
    for (const f of allFighters ?? []) if (f?.FighterId) map.set(f.FighterId, f);
    for (const f of swapFighterDirectory) map.set(f.FighterId, f);
    return map;
  }, [swapFighterDirectory, allFighters]);

  const buildEditableFromPools = useMemo<PoolPlan[]>(
    () =>
      displayPools.map((p) => ({
        poolNo: p.poolNo,
        fighterIds: (p.roster ?? []).map((f) => f.FighterId),
      })),
    [displayPools]
  );
  const [editablePools, setEditablePools] = useState<PoolPlan[]>(buildEditableFromPools);
  useEffect(() => setEditablePools(buildEditableFromPools), [buildEditableFromPools]);

  // ----------------------- API helpers -----------------------
  const handleSwapPersist = async (fromFighterId: number, toFighterId: number) => {
    try {
      const res = await fetch(`${POOLS_RR_API}?action=swap`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, fighterAId: fromFighterId, fighterBId: toFighterId }),
      });
      const data = await res.json();
      if (!res.ok || data.status !== "success") throw new Error(data.message || "Swap failed");

      if (data?.details?.mode === "balanced" && Array.isArray(data?.details?.pools)) {
        const updated = data.details.pools as Array<{ poolId: number; roster?: FullFighter[]; matches?: PoolMatch[] }>;
        setDisplayPools((prev) =>
          prev.map((p) => {
            const found = updated.find((u) => u.poolId === p.poolId);
            return found
              ? { ...p, roster: found.roster ?? p.roster, matches: found.matches ?? p.matches }
              : p;
          })
        );
      } else if (data?.details?.mode === "simple" && Array.isArray(data?.details?.pools)) {
        const updated = data.details.pools as Array<{ poolId: number; roster: FullFighter[] }>;
        setDisplayPools((prev) =>
          prev.map((p) => {
            const found = updated.find((u) => u.poolId === p.poolId);
            return found ? { ...p, roster: found.roster ?? p.roster } : p;
          })
        );
      }

      addToast(data.message || "Swap completed");
      if (data?.details?.mode === "balanced") await reloadPools();
    } catch (err: any) {
      addToast(err.message || "Network error during swap");
    }
  };

  const handleMovePersist = async (movedFighterId: number, toPoolNo: number, _fromPoolId?: number | null) => {
    try {
      const dest = displayPools.find((p) => p.poolNo === toPoolNo);
      if (!dest) throw new Error("Target pool not found");

      const res = await fetch(`${POOLS_RR_API}?action=move`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, movedFighterId, toPoolId: dest.poolId }),
      });
      const data = await res.json();
      if (!res.ok || data.status !== "success") throw new Error(data.message || "Move failed");

      addToast(data.message || "Move completed");
      setDisplayPools((prev) =>
        prev.map((p) =>
          p.poolId === dest.poolId
            ? {
                ...p,
                roster: data.roster || p.roster,
                matches: Array.isArray(data.matches) ? data.matches : p.matches,
              }
            : p
        )
      );
      await reloadPools();
    } catch (err: any) {
      addToast(err.message || "Network error during move");
    }
  };

  // ----------------------- pool management modal -----------------------
  const [managePoolId, setManagePoolId] = useState<number | null>(null);
  const [roster, setRoster] = useState<FullFighter[]>([]);
  const [available, setAvailable] = useState<FullFighter[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const loadCandidates = async (poolId: number) => {
    if (!interactive) return; // disable in read-only mode
    setLoadingCandidates(true);
    try {
      const res = await fetch(
        `${POOLS_RR_API}?action=candidates&eventId=${encodeURIComponent(eventId)}&poolId=${encodeURIComponent(poolId)}`
      );
      const data = await res.json();
      if (data.status === "success") {
        setRoster(Array.isArray(data.roster) ? data.roster : []);
        setAvailable(Array.isArray(data.available) ? data.available : []);
      } else addToast(data.message || "Failed to load pool candidates");
    } catch {
      addToast("Error loading pool candidates");
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleAddFighter = async (fighterId: number) => {
    if (!interactive) return;
    if (!managePoolId) return;
    const fighter = available.find((f) => f.FighterId === fighterId);
    if (!fighter) return;
    setRoster((prev) => [...prev, fighter]);
    setAvailable((prev) => prev.filter((f) => f.FighterId !== fighterId));
    setDisplayPools((prev) =>
      prev.map((p) => (p.poolId === managePoolId ? { ...p, roster: [...p.roster, fighter] } : p))
    );
    try {
      const res = await fetch(`${POOLS_RR_API}?action=addToPool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, poolId: managePoolId, fighterId }),
      });
      const data = await res.json();
      if (data.status !== "success") throw new Error(data.message);
      setRoster(Array.isArray(data.roster) ? data.roster : []);
      setDisplayPools((prev) =>
        prev.map((p) =>
          p.poolId === managePoolId
            ? {
                ...p,
                roster: Array.isArray(data.roster) ? data.roster : p.roster,
                matches: Array.isArray(data.matches) ? data.matches : p.matches,
              }
            : p
        )
      );
      await reloadPools();
    } catch (err: any) {
      addToast(err.message || "Error adding fighter");
    }
  };

  const handleRemoveFighter = async (fighterId: number) => {
    if (!interactive) return;
    if (!managePoolId) return;
    const fighter = roster.find((f) => f.FighterId === fighterId);
    if (!fighter) return;
    setRoster((prev) => prev.filter((f) => f.FighterId !== fighterId));
    setDisplayPools((prev) =>
      prev.map((p) =>
        p.poolId === managePoolId
          ? {
              ...p,
              roster: p.roster.filter((f) => f.FighterId !== fighterId),
              matches: p.matches.filter(
                (m) => !(m.status === "P" && m.fighters?.some((f) => f.FighterId === fighterId))
              ),
            }
          : p
      )
    );
    try {
      const res = await fetch(`${POOLS_RR_API}?action=removeFromPoolAndEvent`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, poolId: managePoolId, fighterId }),
      });
      const data = await res.json();
      if (data.status !== "success") throw new Error(data.message);
      setRoster(Array.isArray(data.roster) ? data.roster : []);
      triggerRefresh();
      await reloadPools();
    } catch (err: any) {
      addToast(err.message || "Error removing fighter");
    }
  };

  const closeManage = () => {
    setManagePoolId(null);
    setRoster([]);
    setAvailable([]);
  };

  // ----------------------- render -----------------------
  if (!displayPools || displayPools.length === 0)
    return (
      <div className="container" style={{ margin: "0 auto" }}>
        <p>No pools generated yet.</p>
      </div>
    );

  return (
    <div className="container" style={{ margin: "0 auto" }}>
      <br />

      <FighterSwapInterface
        fighters={swapFighterDirectory}
        pools={editablePools}
        readOnly={!interactive}
        onSwap={(nextPools, lastSwap) => {
          setEditablePools(nextPools);
          if (!lastSwap) return;

          if ("fromFighterId" in lastSwap && "toFighterId" in lastSwap) {
            const { fromFighterId, toFighterId } = lastSwap;
            setDisplayPools((prev) =>
              prev.map((pool) => {
                const newRoster = pool.roster.map((f) => {
                  if (f.FighterId === fromFighterId) {
                    const nf = fighterById.get(toFighterId);
                    return { ...f, FighterId: toFighterId, FighterName: nf?.FighterName ?? `#${toFighterId}` };
                  }
                  if (f.FighterId === toFighterId) {
                    const nf = fighterById.get(fromFighterId);
                    return { ...f, FighterId: fromFighterId, FighterName: nf?.FighterName ?? `#${fromFighterId}` };
                  }
                  return f;
                });
                return { ...pool, roster: newRoster };
              })
            );
            handleSwapPersist(fromFighterId, toFighterId);
          }

          if ("movedFighterId" in lastSwap && "toPoolNo" in lastSwap) {
            const { movedFighterId, toPoolNo } = lastSwap;
            const from = displayPools.find((p) => p.roster.some((f) => f.FighterId === movedFighterId));
            handleMovePersist(movedFighterId, toPoolNo, from?.poolId ?? null);
          }
        }}
        onManagePool={(poolNo) => {
          if (!interactive) return; // disable manage button in read-only mode
          const pool = displayPools.find((p) => p.poolNo === poolNo);
          if (!pool) {
            addToast(`Pool ${poolNo} not found`);
            return;
          }
          setManagePoolId(pool.poolId);
          loadCandidates(pool.poolId);
        }}
      />

      {/* --- Manage Modal --- */}
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
              color: "#fff",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Manage Pool Fighters</h3>
            {loadingCandidates ? (
              <p>Loading...</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <h4>In Pool</h4>
                  {roster.length === 0 && <p>No fighters</p>}
                  {roster.map((f) => (
                    <div key={f.FighterId} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span>
                        {f.FighterName}
                        {f.ClubAcronym ? ` (${f.ClubAcronym})` : ""}
                      </span>
                      <button onClick={() => handleRemoveFighter(f.FighterId)}>Remove</button>
                    </div>
                  ))}
                </div>
                <div>
                  <h4>Available Fighters</h4>
                  {available.length === 0 && <p>No available fighters</p>}
                  {available.map((f) => (
                    <div key={f.FighterId} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
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

      {/* --- Pool Match Sections --- */}
      {displayPools.map((pool) => {
        const isOpen = !!openPools[pool.poolId];
        const visibleMatches = pool.matches.filter(
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
                Pool {pool.poolNo} – Ring {pool.ringAssigned ?? "-"}{" "}
                <span style={{ color: "#bbb" }}>({visibleMatches.length} matches)</span>
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
                {isOpen ? "Hide Pool" : "Show Pool"}
              </button>
            </div>

            {isOpen && (
              <div style={{ padding: "1rem" }}>
                <div className="matches-grid">
                  {visibleMatches.map((m, idx) => (
                    <MatchCard
                      key={m.matchId}
                      matchId={m.matchId}
                      ringNo={m.ringNo}
                      matchNumber={idx + 1}
                      maxRings={maxRings}
                      interactive={interactive}
                      tournamentId={tournamentId}
                      onDelete={(deletedId) =>
                        setDisplayPools((prev) =>
                          prev.map((p) =>
                            p.poolId === pool.poolId
                              ? { ...p, matches: p.matches.filter((mx) => mx.matchId !== deletedId) }
                              : p
                          )
                        )
                      }
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

/**
 * src/components/Manager/matchSubComponents/MatchRoundRobinPoolsEditor.tsx
 */

import React, { useEffect, useMemo, useState } from "react";
import MatchCard, { MatchStatus } from "../MatchCard";
import FighterSwapInterface, {
  Fighter as SwapFighter,
  PoolPlan,
} from "./FighterSwapInterface";
import { Fighter as FullFighter } from "../../subComponents/useFighters"; 

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
  matches: PoolMatch[];
}

interface MatchRoundRobinPoolsEditorProps {
  pools: PoolBlock[];
  maxRings: number;
  interactive?: boolean;
  allFighters?: FullFighter[]; // now typed correctly
}

const MatchRoundRobinPoolsEditor: React.FC<MatchRoundRobinPoolsEditorProps> = ({
  pools,
  maxRings,
  interactive = true,
  allFighters = [],
}) => {
  const [openPools, setOpenPools] = useState<Record<number, boolean>>(
    () => pools.reduce((acc, pool) => ({ ...acc, [pool.poolId]: false }), {})
  );
  const togglePool = (poolId: number) =>
    setOpenPools((prev) => ({ ...prev, [poolId]: !prev[poolId] }));

  // Build a full fighter directory compatible with MatchCard
  const swapFighterDirectory: FullFighter[] = useMemo(() => {
    const map = new Map<number, FullFighter>();

    for (const f of allFighters) {
      if (f?.FighterId) {
        map.set(f.FighterId, f);
      }
    }

    for (const p of pools) {
      for (const m of p.matches) {
        for (const f of m.fighters ?? []) {
          map.set(f.FighterId, {
            FighterId: f.FighterId,
            FighterName: f.FighterName ?? `#${f.FighterId}`,   // fallback
            ClubAcronym: f.ClubAcronym ?? null,
            ClubId: f.ClubId ?? null,
            ClubName: f.ClubName ?? null,
          });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      (a.FighterName ?? "").localeCompare(b.FighterName ?? "")
    );
  }, [allFighters, pools]);

  // Editable pool plans for the swapper
  const buildEditableFromPools = useMemo<PoolPlan[]>(
    () =>
      pools.map((p) => ({
        poolNo: p.poolNo,
        fighterIds: Array.from(
          new Set(p.matches.flatMap((m) => (m.fighters ?? []).map((f) => f.FighterId)))
        ),
      })),
    [pools]
  );
  const [editablePools, setEditablePools] = useState<PoolPlan[]>(buildEditableFromPools);

  useEffect(() => {
    setEditablePools(buildEditableFromPools);
  }, [buildEditableFromPools]);

  if (!pools || pools.length === 0) {
    return (
      <div className="container" style={{ margin: "0 auto" }}>
        <p>No pools generated yet.</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ margin: "0 auto" }}>
      <h2 style={{ textAlign: "center" }}>Round Robin Pools</h2>

      {/* Fighter swap interface (still uses simplified Fighter type) */}
      <FighterSwapInterface
        fighters={swapFighterDirectory}
        pools={editablePools}
        onSwap={setEditablePools}
      />

      {pools.map((pool) => {
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
                      fighters={(m.fighters ?? []).map((f) => ({
                        FighterId: f.FighterId,
                        FighterName: f.FighterName,
                        ClubAcronym: f.ClubAcronym ?? null,
                        FighterColor: f.FighterColor,
                        FinalScore: 0,
                      }))}
                      status={m.status}
                      allFighters={swapFighterDirectory} 
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

/**
 * src/components/Manager/matchSubComponents/FighterSwapInterface.tsx
 *
 * === Fighter Swap Interface ===
 * Click a fighter in Pool A, then click another in Pool B → swap them.
 * Reusable in both Generator and Editor views.
 */

import React, { useState } from "react";
import { useToast } from "../../../utility/ToastProvider";

export interface Fighter {
  FighterId: number;
  FighterName: string;
  ClubAcronym?: string | null;
}

export interface PoolPlan {
  poolNo: number;
  fighterIds: number[];
}

interface FighterSwapInterfaceProps {
  fighters: Fighter[];
  pools: PoolPlan[];
  onSwap: (updatedPools: PoolPlan[]) => void;
}

const FighterSwapInterface: React.FC<FighterSwapInterfaceProps> = ({
  fighters,
  pools,
  onSwap,
}) => {
  const addToast = useToast();
  const [swapSelection, setSwapSelection] = useState<{
    poolNo: number;
    fighterId: number;
  } | null>(null);

  const fighterLabel = (id: number) => {
    const f = fighters.find((x) => x.FighterId === id);
    if (!f) return `#${id}`;
    return f.ClubAcronym ? `${f.FighterName} (${f.ClubAcronym})` : f.FighterName;
  };

  const handleSelectForSwap = (poolNo: number, fighterId: number) => {
    if (!swapSelection) {
      setSwapSelection({ poolNo, fighterId });
      return;
    }

    // cancel if same fighter clicked
    if (
      swapSelection.poolNo === poolNo &&
      swapSelection.fighterId === fighterId
    ) {
      setSwapSelection(null);
      return;
    }

    // must be across pools
    if (swapSelection.poolNo === poolNo) {
      addToast("Pick a fighter from a different pool to swap.");
      return;
    }

    // clone pools and perform swap
    const next = pools.map((p) => ({ ...p, fighterIds: [...p.fighterIds] }));
    const poolA = next.find((p) => p.poolNo === swapSelection.poolNo)!;
    const poolB = next.find((p) => p.poolNo === poolNo)!;
    const idxA = poolA.fighterIds.indexOf(swapSelection.fighterId);
    const idxB = poolB.fighterIds.indexOf(fighterId);

    if (idxA === -1 || idxB === -1) {
      addToast("Could not locate fighters for swap.");
      setSwapSelection(null);
      return;
    }

    [poolA.fighterIds[idxA], poolB.fighterIds[idxB]] = [
      poolB.fighterIds[idxB],
      poolA.fighterIds[idxA],
    ];

    onSwap(next);
    setSwapSelection(null);
  };

  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ color: "#bbb", marginBottom: 8 }}>
        Swap mode: click one fighter, then click another fighter in a different
        pool to swap.
        {swapSelection && (
          <span style={{ marginLeft: 8, color: "#ddd" }}>
            Selected: {fighterLabel(swapSelection.fighterId)} (Pool{" "}
            {swapSelection.poolNo})
          </span>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "12px",
        }}
      >
        {pools.map((p) => (
          <div
            key={`pool-${p.poolNo}`}
            style={{
              border: "1px solid #444",
              borderRadius: 8,
              padding: 10,
              background: "#1b1b1b",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <strong>Pool {p.poolNo}</strong>
              <span style={{ color: "#999" }}>{p.fighterIds.length} fighters</span>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {p.fighterIds.map((fid) => {
                const selected =
                  swapSelection?.fighterId === fid &&
                  swapSelection?.poolNo === p.poolNo;
                return (
                  <li
                    key={`pool-${p.poolNo}-f-${fid}`}
                    onClick={() => handleSelectForSwap(p.poolNo, fid)}
                    style={{
                      padding: "6px 8px",
                      marginBottom: 6,
                      border: selected
                        ? "1px solid #80bfff"
                        : "1px solid #333",
                      borderRadius: 6,
                      background: selected ? "#0d1b2a" : "#222",
                      cursor: "pointer",
                    }}
                    title="Click to select for swap"
                  >
                    {fighterLabel(fid)}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FighterSwapInterface;

/**
 * src/components/Manager/matchSubComponents/FighterSwapInterface.tsx
 *
 * === Fighter Swap Interface ===
 * - Fighter→Fighter across pools = swap
 * - Fighter→Empty area of another pool = move
 *
 * Notes / Fixes:
 * - Robust click handling so clicking on headers/buttons doesn't trigger a move.
 * - Stop propagation on fighter <li> clicks to avoid container "move" handler.
 * - Defensive checks around indices and data shape.
 */

import React, { useCallback, useState } from "react";
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
  onSwap: (
    updatedPools: PoolPlan[],
    swapDetail?:
      | { fromFighterId: number; toFighterId: number }
      | { movedFighterId: number; toPoolNo: number }
  ) => void;
  onManagePool?: (poolNo: number) => void;
}

const FighterSwapInterface: React.FC<FighterSwapInterfaceProps> = ({
  fighters,
  pools,
  onSwap,
  onManagePool,
}) => {
  const addToast = useToast();

  const [swapSelection, setSwapSelection] = useState<{
    poolNo: number;
    fighterId: number;
  } | null>(null);

  const fighterLabel = useCallback(
    (id: number) => {
      const f = fighters.find((x) => x.FighterId === id);
      if (!f) return `#${id}`;
      return f.ClubAcronym ? `${f.FighterName} (${f.ClubAcronym})` : f.FighterName;
    },
    [fighters]
  );

  /** Selects a fighter for swapping; second click on a different pool's fighter triggers swap */
  const handleSelectForSwap = useCallback(
    (poolNo: number, fighterId: number) => {
      // First click -> select
      if (!swapSelection) {
        setSwapSelection({ poolNo, fighterId });
        return;
      }

      // Clicking the same fighter toggles off
      if (swapSelection.poolNo === poolNo && swapSelection.fighterId === fighterId) {
        setSwapSelection(null);
        return;
      }

      // Must pick a fighter in a different pool to swap
      if (swapSelection.poolNo === poolNo) {
        addToast("Pick a fighter from a different pool to swap.");
        return;
      }

      // Perform swap (optimistic via parent)
      const next = pools.map((p) => ({ ...p, fighterIds: [...p.fighterIds] }));
      const poolA = next.find((p) => p.poolNo === swapSelection.poolNo);
      const poolB = next.find((p) => p.poolNo === poolNo);

      if (!poolA || !poolB) {
        addToast("Unexpected error: pool not found.");
        setSwapSelection(null);
        return;
      }

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

      onSwap(next, {
        fromFighterId: swapSelection.fighterId,
        toFighterId: fighterId,
      });
      setSwapSelection(null);
    },
    [addToast, onSwap, pools, swapSelection]
  );

  /** Moves selected fighter to another pool when user clicks pool background/empty area */
  const handleMoveToPool = useCallback(
    (targetPoolNo: number) => {
      if (!swapSelection) return;

      if (swapSelection.poolNo === targetPoolNo) {
        // Clicking same pool background just clears selection
        setSwapSelection(null);
        return;
      }

      const next = pools.map((p) => ({ ...p, fighterIds: [...p.fighterIds] }));
      const fromPool = next.find((p) => p.poolNo === swapSelection.poolNo);
      const toPool = next.find((p) => p.poolNo === targetPoolNo);

      if (!fromPool || !toPool) {
        addToast("Unexpected error: pool not found.");
        setSwapSelection(null);
        return;
      }

      const idx = fromPool.fighterIds.indexOf(swapSelection.fighterId);
      if (idx === -1) {
        addToast("Could not locate fighter for move.");
        setSwapSelection(null);
        return;
      }

      fromPool.fighterIds.splice(idx, 1);
      toPool.fighterIds.push(swapSelection.fighterId);

      onSwap(next, {
        movedFighterId: swapSelection.fighterId,
        toPoolNo: targetPoolNo,
      });
      setSwapSelection(null);
    },
    [addToast, onSwap, pools, swapSelection]
  );

  /** Container click: only treat as "move to pool" when:
   *  - a fighter is selected
   *  - the click was NOT on a fighter list item or a button inside the pool card
   */
  const onPoolCardClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, poolNo: number) => {
      if (!swapSelection) return;

      const target = e.target as HTMLElement;
      // if user clicked on a fighter <li>, do nothing (li handler will run)
      if (target.closest('li[data-fighter="true"]')) return;
      // if user clicked on a button (e.g. Manage Pool Fighters), do nothing
      if (target.closest("button")) return;

      // Otherwise treat as dropping into this pool
      handleMoveToPool(poolNo);
    },
    [handleMoveToPool, swapSelection]
  );

  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ color: "#bbb", marginBottom: 8 }}>
        Swap mode: click one fighter, then another in a different pool to swap. <br />
        Move mode: click one fighter, then click the empty area of another pool to move.
        {swapSelection && (
          <span style={{ marginLeft: 8, color: "#ddd" }}>
            Selected:&nbsp;
            <strong>{fighterLabel(swapSelection.fighterId)}</strong>
            &nbsp;(Pool {swapSelection.poolNo})
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
            onClick={(e) => onPoolCardClick(e, p.poolNo)}
            style={{
              border: "1px solid #444",
              borderRadius: 8,
              padding: 10,
              background: "#1b1b1b",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              cursor: swapSelection ? "pointer" : "default",
              userSelect: "none",
            }}
            aria-label={`Pool ${p.poolNo}`}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <strong>Pool {p.poolNo}</strong>
                <span style={{ color: "#999" }}>
                  {p.fighterIds?.length ?? 0} fighters
                </span>
              </div>

              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {(p.fighterIds ?? []).map((fid) => {
                  const selected =
                    swapSelection?.fighterId === fid &&
                    swapSelection?.poolNo === p.poolNo;
                  return (
                    <li
                      key={`pool-${p.poolNo}-f-${fid}`}
                      data-fighter="true"
                      onClick={(e) => {
                        e.stopPropagation(); // prevent container click from treating this as a "move"
                        handleSelectForSwap(p.poolNo, fid);
                      }}
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

            {onManagePool && (
              <button
                onClick={(e) => {
                  e.stopPropagation(); // don't trigger move on container
                  onManagePool(p.poolNo);
                }}
                style={{
                  marginTop: "0.5rem",
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #666",
                  background: "#2a2a2a",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Manage Pool Fighters
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FighterSwapInterface;

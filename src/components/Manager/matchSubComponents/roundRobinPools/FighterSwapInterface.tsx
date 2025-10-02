/**
 * src/components/Manager/matchSubComponents/FighterSwapInterface.tsx
 *
 * === Fighter Swap Interface ===
 * - Fighter→Fighter across pools = swap
 * - Fighter→Empty area of another pool = move
 *
 * Supports readOnly mode:
 * - Pools render but all interactivity (swap/move/manage) disabled.
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
  readOnly?: boolean;
}

const FighterSwapInterface: React.FC<FighterSwapInterfaceProps> = ({
  fighters,
  pools,
  onSwap,
  onManagePool,
  readOnly = false,
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
      if (readOnly) return; // disabled

      if (!swapSelection) {
        setSwapSelection({ poolNo, fighterId });
        return;
      }

      if (swapSelection.poolNo === poolNo && swapSelection.fighterId === fighterId) {
        setSwapSelection(null);
        return;
      }

      if (swapSelection.poolNo === poolNo) {
        addToast("Pick a fighter from a different pool to swap.");
        return;
      }

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
    [addToast, onSwap, pools, swapSelection, readOnly]
  );

  /** Moves selected fighter to another pool */
  const handleMoveToPool = useCallback(
    (targetPoolNo: number) => {
      if (readOnly) return; // disabled
      if (!swapSelection) return;

      if (swapSelection.poolNo === targetPoolNo) {
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
    [addToast, onSwap, pools, swapSelection, readOnly]
  );

  /** Handle background click for moving fighters */
  const onPoolCardClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, poolNo: number) => {
      if (readOnly) return; // disabled
      if (!swapSelection) return;

      const target = e.target as HTMLElement;
      if (target.closest('li[data-fighter="true"]')) return;
      if (target.closest("button")) return;

      handleMoveToPool(poolNo);
    },
    [handleMoveToPool, swapSelection, readOnly]
  );

  return (
    <div style={{ marginBottom: "1rem" }}>
      {!readOnly && (
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
      )}

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
              cursor: !readOnly && swapSelection ? "pointer" : "default",
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
                        if (readOnly) return;
                        e.stopPropagation();
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
                        cursor: readOnly ? "default" : "pointer",
                      }}
                      title={readOnly ? undefined : "Click to select for swap"}
                    >
                      {fighterLabel(fid)}
                    </li>
                  );
                })}
              </ul>
            </div>

            {!readOnly && onManagePool && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
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

/**
 * src/components/Manager/matchSubComponents/MatchRoundRobinPoolsGenerator.tsx
 *
 * === Round Robin Pools (Generate) ===
 * Handles fetching fighters, creating/shuffling pools, swapping fighters,
 * and saving Pools + Matches + PoolMatches to DB.
 */

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { backend_uri, event_fighters_api, round_robin_pool_api, } from "../../../utility/endpoints";
import { useToast } from "../../../utility/ToastProvider";
import FighterSwapInterface, { Fighter, PoolPlan, } from "./FighterSwapInterface";

interface MatchRoundRobinPoolsGeneratorProps {
  eventId: number;
  eventName?: string;
  maxRings?: number;
  onSaved?: (pools: any[]) => void; // callback to parent with structured pools
}

type ApiEnvelope<T> = {
  status: "success" | "error";
  message?: string;
  [key: string]: any;
} & T;

type SavePayload = {
  eventId: number;
  deleteExisting: boolean;
  pools: Array<{
    poolNo: number;
    fighterIds: number[];
    matches: Array<[number, number]>;
  }>;
};

const EVENT_FIGHTERS_API = `${backend_uri}/${event_fighters_api}`;
const POOLS_RR_API = `${backend_uri}/${round_robin_pool_api}`;

const DEFAULT_MIN = 4;
const DEFAULT_MAX = 6;

/* Shuffle utility */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Round-robin pair builder */
function buildRoundRobinPairs(ids: number[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      pairs.push([ids[i], ids[j]]);
    }
  }
  return pairs;
}

/* Compute pool sizes */
function computePoolSizes(
  n: number,
  minSize: number,
  maxSize: number
): number[] | null {
  if (n <= 0 || minSize <= 0 || maxSize < minSize) return null;

  let pools = Math.ceil(n / maxSize);

  for (; pools <= n; pools++) {
    const base = Math.floor(n / pools);
    const extra = n % pools;
    if (base < minSize) continue;
    if (base > maxSize) continue;
    if (base === maxSize && extra > 0) continue;

    const sizes: number[] = Array.from(
      { length: pools },
      (_, i) => base + (i < extra ? 1 : 0)
    );
    if (sizes.every((s) => s >= minSize && s <= maxSize)) return sizes;
  }

  if (n >= minSize && n <= maxSize) return [n];
  return null;
}

const MatchRoundRobinPoolsGenerator: React.FC<
  MatchRoundRobinPoolsGeneratorProps
> = ({ eventId, eventName, maxRings, onSaved }) => {
  const addToast = useToast();

  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [minPerPool, setMinPerPool] = useState<number>(DEFAULT_MIN);
  const [maxPerPool, setMaxPerPool] = useState<number>(DEFAULT_MAX);

  const [plan, setPlan] = useState<PoolPlan[] | null>(null);
  const [saving, setSaving] = useState(false);

  // Track if inputs have changed
  const [inputsChanged, setInputsChanged] = useState(false);

  // Fetch Event fighters
  useEffect(() => {
    let abort = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${EVENT_FIGHTERS_API}?eventId=${encodeURIComponent(eventId)}`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
          }
        );
        const data: ApiEnvelope<{ fighters: Fighter[] }> = await res.json();
        if (abort) return;
        if (data.status !== "success") {
          setError(data.message || "Failed to fetch fighters.");
          setFighters([]);
        } else {
          setFighters(
            (data.fighters || []).slice().sort((a, b) =>
              a.FighterName.localeCompare(b.FighterName)
            )
          );
        }
      } catch (e: any) {
        if (!abort) setError(e?.message || "Network error fetching fighters.");
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => {
      abort = true;
    };
  }, [eventId]);

  const totalFighters = fighters.length;

  const poolSizes = useMemo(() => {
    if (totalFighters === 0) return null;
    return computePoolSizes(totalFighters, minPerPool, maxPerPool);
  }, [totalFighters, minPerPool, maxPerPool]);

  const totalMatchesProjected = useMemo(() => {
    if (poolSizes) {
      return poolSizes.reduce(
        (acc, size) => acc + (size * (size - 1)) / 2,
        0
      );
    }
    return 0;
  }, [poolSizes]);

  const generatePlan = useCallback(() => {
    if (!poolSizes) {
      addToast("Cannot compute pool sizes. Adjust min/max.");
      return;
    }
    const shuffled = shuffle(fighters).map((f) => f.FighterId);
    const newPlan: PoolPlan[] = [];
    let idx = 0;
    poolSizes.forEach((size, i) => {
      newPlan.push({
        poolNo: i + 1,
        fighterIds: shuffled.slice(idx, idx + size),
      });
      idx += size;
    });
    setPlan(newPlan);
    setInputsChanged(false); // reset to unchanged after generation
  }, [fighters, poolSizes, addToast]);

  const buildSavePayload = useCallback((): SavePayload | null => {
    if (!plan) {
      addToast("No pool plan to save. Generate pools first.");
      return null;
    }
    const poolsWithPairs = plan.map((p) => ({
      poolNo: p.poolNo,
      fighterIds: p.fighterIds.slice(),
      matches: buildRoundRobinPairs(p.fighterIds),
    }));
    return {
      eventId,
      deleteExisting: true,
      pools: poolsWithPairs,
    };
  }, [plan, eventId, addToast]);

  const handleSave = useCallback(async () => {
    const confirmed = window.confirm(
      `!!!DANGER WARNING!!!\n\nSaving Pools & Matches will DELETE ALL existing pools, matches, AND SCORES for ${eventName} — including completed and in-progress matches.\nAre you sure you want to continue?\n\nYou are safe to continue if there are no matches currently in ${eventName}.`
    );
    if (!confirmed) return;

    const payload = buildSavePayload();
    if (!payload) return;

    setSaving(true);
    try {
      const res = await fetch(`${POOLS_RR_API}?action=save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data: ApiEnvelope<{
        matchesInserted?: number;
        poolsInserted?: number;
        poolMatchesInserted?: number;
        pools?: any[]; // structured pools from API
      }> = await res.json();

      if (data.status !== "success") {
        addToast(data.message || "Failed to save pools/matches.");
        return;
      }

      addToast(
        `Saved new matches and pools to database`
      );
      if (data.pools && onSaved) {
        onSaved(data.pools); // hand JSON up to parent so editor can open
      }
    } catch (e: any) {
      addToast(e?.message || "Network error while saving pools.");
    } finally {
      setSaving(false);
    }
  }, [buildSavePayload, addToast, onSaved]);

  useEffect(() => {
    if (fighters.length > 0 && poolSizes && plan === null) {
      generatePlan();
    }
  }, [fighters, poolSizes, plan, generatePlan]);

  if (loading) return <div>Loading Event fighters…</div>;
  if (error) return <div style={{ color: "#f77" }}>Error: {error}</div>;

  return (
    <div>
      {/* Controls */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: "0.75rem",
          alignItems: "end",
          margin: "0.75rem 0 1rem",
        }}
      >
        {/* Min per Pool */}
        <div>
          <label style={{ display: "block", color: "#ddd", marginBottom: 4 }}>
            Min per Pool
          </label>
          <div className="number-input-wrapper">
            <input
              type="number"
              value={minPerPool}
              readOnly
              className="number-input"
            />
            <div className="spinner-buttons">
              <button
                onClick={() => {
                  setMinPerPool((v) => v + 1);
                  setInputsChanged(true);
                }}
              >
                ▲
              </button>
              <button
                onClick={() => {
                  setMinPerPool((v) => Math.max(1, v - 1));
                  setInputsChanged(true);
                }}
              >
                ▼
              </button>
            </div>
          </div>
        </div>

        {/* Max per Pool */}
        <div>
          <label style={{ display: "block", color: "#ddd", marginBottom: 4 }}>
            Max per Pool
          </label>
          <div className="number-input-wrapper">
            <input
              type="number"
              value={maxPerPool}
              readOnly
              className="number-input"
            />
            <div className="spinner-buttons">
              <button
                onClick={() => {
                  setMaxPerPool((v) => v + 1);
                  setInputsChanged(true);
                }}
              >
                ▲
              </button>
              <button
                onClick={() => {
                  setMaxPerPool((v) => Math.max(minPerPool, v - 1));
                  setInputsChanged(true);
                }}
              >
                ▼
              </button>
            </div>
          </div>
        </div>

        {/* Read-only stats */}
        <div className="display-field">
          <label style={{ display: "block", color: "#ddd", marginBottom: 4 }}>
            Fighters in Event
          </label>
          <div>{totalFighters}</div>
        </div>
        <div className="display-field">
          <label style={{ display: "block", color: "#ddd", marginBottom: 4 }}>
            Total Pools
          </label>
          <div>{poolSizes ? poolSizes.length : "-"}</div>
        </div>
        <div className="display-field">
          <label style={{ display: "block", color: "#ddd", marginBottom: 4 }}>
            Total Matches
          </label>
          <div>{totalMatchesProjected}</div>
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        {!inputsChanged && (
          <button
            disabled={!plan || saving}
            onClick={handleSave}
            style={{
              background: !plan || saving ? "#444" : "#2d6a4f",
              color: "#fff",
              padding: "8px 12px",
              border: "1px solid #1b4332",
              borderRadius: 6,
              cursor: !plan || saving ? "not-allowed" : "pointer",
            }}
            title="Deletes all existing matches for this Event, then inserts Pools + Matches + PoolMatches"
          >
            {saving ? "Saving…" : "Save Pools & Matches"}
          </button>
        )}
        <button
          onClick={generatePlan}
          style={{
            background: "#333",
            color: "#fff",
            padding: "8px 12px",
            border: "1px solid #444",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          {inputsChanged ? "Generate" : "Shuffle"}
        </button>
      </div>

      {!poolSizes && (
        <div style={{ color: "#e0b050", marginBottom: "1rem" }}>
          Could not compute pool sizes from {totalFighters} fighters with
          min={minPerPool}, max={maxPerPool}. Try adjusting your constraints.
        </div>
      )}

      {!inputsChanged && plan && (
        <FighterSwapInterface
          fighters={fighters}
          pools={plan}
          onSwap={setPlan}
        />
      )}

      <div style={{ marginTop: "1rem", color: "#aaa" }}>
        After saving, use <code>MatchCard.tsx</code> views to display the final
        layout by pool or by match. Rings are unassigned (MatchRingNo = 0) until
        scheduled by the scorekeeping desk.
        {typeof maxRings === "number" && (
          <span> Max rings available for this Event: {maxRings}.</span>
        )}
      </div>
    </div>
  );
};

export default MatchRoundRobinPoolsGenerator;

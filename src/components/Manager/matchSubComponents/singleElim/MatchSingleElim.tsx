/**
 * src/components/Manager/matchSubComponents/MatchSingleElim.tsx
 *
 * === Single Elimination (Create + Edit) ===
 * Orchestrates generation + display of a single-elimination bracket for an Event.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { backend_uri, single_elimination_api } from "../../../utility/endpoints";
import { useToast } from "../../../utility/ToastProvider";
import MatchSingleElimGenerator from "./MatchSingleElimGenerator";
import ErrorBoundary from "../../../utility/ErrorBoundary";
import {
  safeParseJson,
  normalizeBracketFormat,
  sanitizeBracketRounds,
} from "../../../utility/dataGuards";

// --- Types aligned with backend JSON ---
export interface BracketFighter {
  fighterId: number;
  fighterName: string | null;
  clubId: number | null;
}

export interface BracketMatch {
  matchId: number;
  bracketNo: number;
  bracketSection: "W" | "L";
  matchRing: number | null;
  matchQueue: number | null;
  nextMatchWin: number | null;
  nextMatchLoss: number | null;
  fighters: BracketFighter[];
}

export interface BracketRounds {
  [bracketNo: string]: BracketMatch[];
}

interface FetchResponse {
  status: "success" | "error";
  message?: string;
  bracketId?: number;
  format?: "S" | "D" | string;
  hasBronze?: boolean;
  maxPools?: number;
  rounds?: BracketRounds | null;
}

interface MatchSingleElimProps {
  eventId: number;
  eventName: string;
  maxRings: number;
  isActive: boolean;
  tournamentId: number;
}

// Small presentational box for a single match
const BracketMatchBox: React.FC<{ match: BracketMatch }> = ({ match }) => {
  const f1 = match.fighters?.[0] ?? null;
  const f2 = match.fighters?.[1] ?? null;

  return (
    <div
      className="se-match-box"
      style={{
        border: "1px solid #555",
        borderRadius: 8,
        padding: 8,
        marginBottom: 8,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.75 }}>
        Match #{match.matchId ?? "?"}{" "}
        {match.matchRing ? `• Ring ${match.matchRing}` : ""}
      </div>
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          marginTop: 6,
        }}
      >
        <div style={{ flex: 1 }}>
          {f1?.fighterName || <span style={{ opacity: 0.6 }}>—</span>}
        </div>
        <div style={{ opacity: 0.6 }}>&nbsp;vs&nbsp;</div>
        <div style={{ flex: 1 }}>
          {f2?.fighterName || <span style={{ opacity: 0.6 }}>—</span>}
        </div>
      </div>
    </div>
  );
};

const eliminationApi = `${backend_uri}/${single_elimination_api}`;

const MatchSingleElim: React.FC<MatchSingleElimProps> = ({
  eventId,
  eventName,
  maxRings,
  isActive,
  tournamentId,
}) => {
  const addToast = useToast();

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rounds, setRounds] = useState<BracketRounds>({});
  const [format, setFormat] = useState<"S" | "D" | undefined>("S");
  const [bracketId, setBracketId] = useState<number | undefined>(undefined);
  const [hasBronze, setHasBronze] = useState<boolean | undefined>(undefined);

  const fetchBracket = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(eliminationApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetch", eventId }),
      }).catch((e) => {
        throw new Error(`Network error: ${e?.message || e}`);
      });

      if (!res) throw new Error("No response from server");

      const bodyText = await res.text().catch(() => null);
      const data: FetchResponse | null = safeParseJson(bodyText);

      if (!data || data.status !== "success") {
        throw new Error(
          (data && data.message) ||
            `Unexpected response (status ${res.status}): ${
              typeof bodyText === "string"
                ? bodyText.slice(0, 200)
                : "(no body)"
            }`
        );
      }

      setRounds(sanitizeBracketRounds(data.rounds));
      setFormat(normalizeBracketFormat(data.format));
      if (typeof data.bracketId === "number") setBracketId(data.bracketId);
      if (typeof data.hasBronze === "boolean") setHasBronze(data.hasBronze);
    } catch (err: any) {
      const msg = err?.message || String(err);
      setError(msg);
      addToast(`Error fetching bracket: ${msg}`);
      setRounds({});
    } finally {
      setLoading(false);
    }
  }, [eventId, addToast]);

  // On mount: if SE is already active, fetch it
  useEffect(() => {
    if (isActive) {
      fetchBracket();
    } else {
      setRounds({});
      setBracketId(undefined);
      setHasBronze(undefined);
      setError(null);
    }
  }, [isActive, fetchBracket]);

  // After create callback: accept the exact payload from backend, no refetch needed
  const handleCreated = useCallback(
    (payload: FetchResponse) => {
      if (payload.status === "success") {
        setRounds(sanitizeBracketRounds(payload.rounds));
        if (typeof payload.bracketId === "number") setBracketId(payload.bracketId);
        setFormat(normalizeBracketFormat(payload.format));
        setHasBronze(payload.hasBronze);
        setError(null);
        addToast("Single-elimination bracket created.");
      } else {
        setError(payload.message || "Failed to create bracket.");
        addToast(payload.message || "Failed to create bracket.");
      }
    },
    [addToast]
  );

  // Sorted round keys for column order
  const sortedRoundKeys = useMemo(() => {
    const nums = Object.keys(rounds)
      .map((k) => parseInt(k, 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
    return nums;
  }, [rounds]);

  // Compute labeling metadata
  const labeling = useMemo(() => {
    if (sortedRoundKeys.length === 0) {
      return { standardTotalRounds: 0, finalRoundNo: 0, bronzeRoundNo: 0 };
    }
    const finalRoundNo = Math.max(...sortedRoundKeys);
    const bronzeRoundNo = sortedRoundKeys.find((n) => n !== finalRoundNo) || 0;
    const standardTotalRounds =
      bronzeRoundNo > 0 ? Math.max(finalRoundNo, bronzeRoundNo) : finalRoundNo;
    return { standardTotalRounds, finalRoundNo, bronzeRoundNo };
  }, [sortedRoundKeys]);

  const renderRoundTitle = (roundNo: number) => {
    const { standardTotalRounds, finalRoundNo, bronzeRoundNo } = labeling;
    if (roundNo === finalRoundNo) return "Final";
    if (roundNo === bronzeRoundNo && bronzeRoundNo > 0) return "Bronze";
    if (standardTotalRounds > 0) return `${roundNo}/${standardTotalRounds} Finals`;
    return `Round ${roundNo}`;
  };

  return (
    <ErrorBoundary>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <h2 style={{ margin: 0 }}>Single Elimination — {eventName}</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={fetchBracket}
              disabled={loading}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #666",
                background: "transparent",
                cursor: "pointer",
              }}
              title="Fetch latest bracket from server"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Loading / error states */}
        {loading && <div style={{ opacity: 0.7 }}>Loading bracket…</div>}
        {error && <div style={{ color: "red", fontSize: 14 }}>Error: {error}</div>}

        {/* Generator: strictly show only if not active */}
        {!isActive && !loading && (
          <MatchSingleElimGenerator
            eventId={eventId}
            maxRings={maxRings}
            onCreated={handleCreated}
            tournamentId={tournamentId}
          />
        )}

        {/* Display bracket columns when data exists */}
        {!loading && !error && Object.keys(rounds).length > 0 && (
          <div
            className="single-elim-grid"
            style={{
              display: "grid",
              gridAutoFlow: "column",
              gap: 16,
              alignItems: "start",
            }}
          >
            {sortedRoundKeys.map((roundNo) => (
              <div key={roundNo} className="se-column" style={{ minWidth: 280 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  {renderRoundTitle(roundNo)}
                </div>
                {(rounds[String(roundNo)] || []).map((m) => (
                  <BracketMatchBox
                    key={m.matchId ? String(m.matchId) : `${roundNo}-x`}
                    match={m}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && isActive && Object.keys(rounds).length === 0 && (
          <div style={{ opacity: 0.7 }}>No bracket data available.</div>
        )}

        {/* Optional debug/footer */}
        <div style={{ fontSize: 12, opacity: 0.65 }}>
          {format === "S"
            ? "Format: Single Elimination"
            : format === "D"
            ? "Format: Double Elimination"
            : ""}
          {typeof bracketId === "number" ? ` • BracketId: ${bracketId}` : ""}
          {typeof hasBronze === "boolean"
            ? ` • Bronze: ${hasBronze ? "Yes" : "No"}`
            : ""}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default MatchSingleElim;

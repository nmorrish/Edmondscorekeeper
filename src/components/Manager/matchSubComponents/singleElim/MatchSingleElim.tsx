/**
 * src/components/Manager/matchSubComponents/MatchSingleElim.tsx
 *
 * === Single Elimination (Create + Edit) ===
 * Orchestrates generation + display of a single-elimination bracket for an Event.
 */

import React, { useCallback, useEffect, useState } from "react";
import { backend_uri, single_elimination_api } from "../../../utility/endpoints";
import { useToast } from "../../../utility/ToastProvider";
import MatchSingleElimGenerator from "./MatchSingleElimGenerator";
import ErrorBoundary from "../../../utility/ErrorBoundary";
import {
  safeParseJson,
  normalizeBracketFormat,
  sanitizeBracketRounds,
} from "../../../utility/dataGuards";
import MatchSingleElimEditor from "./MatchSingleElimEditor";
import MatchSingleElimFighterList from "./MatchSingleElimFighterList";

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
  const [locallyActive, setLocallyActive] = useState<boolean>(false);

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
        setLocallyActive(true); // ✅ activate editor immediately
        addToast("Single-elimination bracket created.");
      } else {
        setError(payload.message || "Failed to create bracket.");
        addToast(payload.message || "Failed to create bracket.");
      }
    },
    [addToast]
  );

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
        </div>

        {/* Loading / error states */}
        {loading && <div style={{ opacity: 0.7 }}>Loading bracket…</div>}
        {error && <div style={{ color: "red", fontSize: 14 }}>Error: {error}</div>}

        {/* Generator: only if not active OR if user reset */}
        {(!isActive && !locallyActive) && !loading && (
          <MatchSingleElimGenerator
            eventId={eventId}
            maxRings={maxRings}
            onCreated={handleCreated}
            tournamentId={tournamentId}
          />
        )}

        {/* Editor: when data exists */}
        {!loading && !error && (locallyActive || Object.keys(rounds).length > 0) && (
          <>
            <MatchSingleElimFighterList
              eventId={eventId}
              tournamentId={tournamentId}
              showManage={false}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                margin: "8px 0",
              }}
            >
              <button
                onClick={() => {
                  const ok = window.confirm(
                    "!!!DANGER WARNING!!!\n\nRe-creating the bracket will erase the current bracket and all its matches for this event.\nTHIS CANNOT BE UNDONE!\nContinue?"
                  );
                  if (!ok) return;

                  setRounds({});
                  setBracketId(undefined);
                  setHasBronze(undefined);
                  setError(null);
                  setLocallyActive(false);
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid #666",
                  cursor: "pointer",
                  background: "#1b1b1b",
                }}
              >
                Re-create Bracket
              </button>
            </div>

            <MatchSingleElimEditor
              rounds={rounds}
              maxRings={maxRings}
              interactive={true}
              onChange={(id, fighters) => console.log("Changed", id, fighters)}
            />
          </>
        )}

        {/* Empty state */}
        {!loading && !error && isActive && !locallyActive && Object.keys(rounds).length === 0 && (
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

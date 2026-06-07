/**
 * src/components/Manager/matchSubComponents/singleElim/MatchSingleElim.tsx
 *
 * === Single Elimination (Create + Edit) ===
 * Orchestrates generation + display of a single-elimination bracket for an Event.
 */

import React, { useCallback, useEffect, useState } from "react";
import { backend_uri, bracket_api } from "../../../utility/endpoints";
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
import { apiQuery } from "../../../utility/apiClient";

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
  readOnly: boolean; 
}

const eliminationApi = `${backend_uri}/${bracket_api}`;

const MatchSingleElim: React.FC<MatchSingleElimProps> = ({
  eventId,
  eventName,
  maxRings,
  isActive,
  tournamentId,
  readOnly = false,
}) => {
  const addToast = useToast();

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rounds, setRounds] = useState<BracketRounds>({});
  const [format, setFormat] = useState<"S" | "D" | undefined>("S");
  const [bracketId, setBracketId] = useState<number | undefined>(undefined);
  const [hasBronze, setHasBronze] = useState<boolean | undefined>(undefined);
  const [locallyActive, setLocallyActive] = useState<boolean>(false);

  const [activeMenu, setActiveMenu] = useState<string>(() => {
    return localStorage.getItem(`elimMenu-${eventId}`) || "editor";
  });

  useEffect(() => {
    localStorage.setItem(`elimMenu-${eventId}`, activeMenu);
  }, [activeMenu, eventId]);

  const fetchBracket = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiQuery(eliminationApi, {
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

  const handleCreated = useCallback(
    (payload: FetchResponse) => {
      if (payload.status === "success") {
        setRounds(sanitizeBracketRounds(payload.rounds));
        if (typeof payload.bracketId === "number") setBracketId(payload.bracketId);
        setFormat(normalizeBracketFormat(payload.format));
        setHasBronze(payload.hasBronze);
        setError(null);
        setLocallyActive(true);
        addToast("Single-elimination bracket created.");
        setActiveMenu("editor");
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

        {loading && <div style={{ opacity: 0.7 }}>Loading bracket…</div>}
        {error && <div style={{ color: "red", fontSize: 14 }}>Error: {error}</div>}

        {/* Generator */}
        {((!isActive && Object.keys(rounds).length === 0) ||
          (!locallyActive && Object.keys(rounds).length === 0)) &&
          !loading &&
          !readOnly && (
            <MatchSingleElimGenerator
              eventId={eventId}
              maxRings={maxRings}
              onCreated={handleCreated}
              tournamentId={tournamentId}
            />
          )}

        {/* Editor */}
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
                gap: 8,
                margin: "8px 0",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => {
                  setActiveMenu("refresh");
                  fetchBracket();
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "2px solid #0af",
                  background: "#222",
                }}
              >
                Refresh View
              </button>

              {!readOnly && (
                <button
                  onClick={() => {
                    setRounds({});
                    setBracketId(undefined);
                    setHasBronze(undefined);
                    setError(null);
                    setLocallyActive(false);
                    setActiveMenu("recreate");
                  }}
                  style={{
                    padding: "6px 12px",
                    background: "#840000ff",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    fontWeight: "bold",
                  }}
                >
                  Regenerate Brackets
                </button>
              )}
            </div>

            <MatchSingleElimEditor
              rounds={rounds}
              maxRings={maxRings}
              interactive={!readOnly}
              onChange={(id, fighters) => console.log("Changed", id, fighters)}
              tournamentId={tournamentId}
            />
          </>
        )}

        {!loading &&
          !error &&
          isActive &&
          !locallyActive &&
          Object.keys(rounds).length === 0 && (
            <div style={{ opacity: 0.7 }}>No bracket data available.</div>
          )}

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

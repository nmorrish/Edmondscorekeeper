/**
 * src/components/Manager/matchSubComponents/MatchCard.tsx
 *
 * Portable MatchCard (Self-Fetching)
 * - Removed `fighters` and `allFighters` props.
 * - Always self-loads its match + fighter dropdown data using matchId and tournamentId.
 * - Automatically prefers tournament fighters, falls back to event fighters.
 * - All interactive functions (swap, complete, pending, delete) preserved.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Fighter } from "../subComponents/useFighters";
import { backend_uri, match_api, event_fighters_api } from "../../utility/endpoints";
import { useToast } from "../../utility/ToastProvider";
import FighterDropdown from "./fighterDropdown";
import MatchActions from "./matchActions";
import RingDropdown from "./ringDropdown";
import { apiQuery } from "../../utility/apiClient";

export type MatchStatus = "P" | "A" | "D";

export interface MatchFighterRow {
  FighterId: number;
  FighterName: string;
  ClubAcronym?: string | null;
  FighterColor: string;
  FinalScore?: number;
}

interface MatchCardProps {
  matchId: number;
  ringNo: number;
  matchNumber: number;
  maxRings: number;
  tournamentId: number;

  interactive?: boolean;

  onChange?: (matchId: number, updatedFighters: MatchFighterRow[]) => void;
  onDelete?: (matchId: number) => void;
  onComplete?: (matchId: number) => void;
  onChangeRing?: (matchId: number, newRing: number) => void;
}

const EVENT_FIGHTERS_API = `${backend_uri}/${event_fighters_api}`;
const TOURNAMENT_FIGHTERS_API = `${backend_uri}/tournamentFightersApi.php`;

const MatchCard: React.FC<MatchCardProps> = ({
  matchId,
  ringNo,
  matchNumber,
  maxRings,
  tournamentId,
  interactive = false,
  onChange,
  onDelete,
  onComplete,
  onChangeRing,
}) => {
  const addToast = useToast();

  // --- Local state ---
  const [localFighters, setLocalFighters] = useState<MatchFighterRow[]>([]);
  const [localStatus, setLocalStatus] = useState<MatchStatus>("P");
  const [localRing, setLocalRing] = useState<number>(ringNo);
  const [eventId, setEventId] = useState<number | null>(null);
  const [localAllFighters, setLocalAllFighters] = useState<Fighter[]>([]);

  // --- Decide if we need to fetch match info ---
  const needsMatchFetch = useMemo(() => {
    if (!localFighters || localFighters.length < 2) return true;
    return localFighters.some((f) => !f.FighterName || f.FighterName.trim() === "");
  }, [localFighters]);

  // --- Load match details if needed ---
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const res = await apiQuery(`${backend_uri}/${match_api}?id=${matchId}`, {
          headers: { Accept: "application/json" },
        });
        const data = await res.json();
        if (abort) return;

        if (res.ok && data.status === "success" && data.match) {
          const m = data.match;
          setLocalFighters(
            (m.fighters || []).map((f: any) => ({
              FighterId: Number(f.FighterId),
              FighterName: f.FighterName ?? `#${f.FighterId}`,
              ClubAcronym: f.ClubAcronym ?? null,
              FighterColor: f.FighterColor,
              FinalScore:
                f.FinalScore !== null && f.FinalScore !== undefined
                  ? Number(f.FinalScore)
                  : null,
            }))
          );
          if (m.PendingActiveDone) setLocalStatus(m.PendingActiveDone as MatchStatus);
          if (typeof m.MatchRingNo === "number") setLocalRing(m.MatchRingNo);
          if (typeof m.EventId === "number") setEventId(m.EventId);
        } else {
          addToast("Failed to load match details.");
        }
      } catch {
        if (!abort) addToast("Network error loading match.");
      }
    })();
    return () => {
      abort = true;
    };
  }, [matchId, needsMatchFetch, addToast]);

  // --- Unified fighter load (tournament first, fallback to event) ---
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        let url: string | null = null;

        if (tournamentId) {
          url = `${TOURNAMENT_FIGHTERS_API}?tournamentId=${encodeURIComponent(tournamentId)}`;
        } else if (eventId) {
          url = `${EVENT_FIGHTERS_API}?eventId=${encodeURIComponent(eventId)}`;
        }

        if (!url) return;

        const res = await apiQuery(url, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const text = await res.text();
        if (abort) return;

        let data;
        try {
          data = JSON.parse(text);
        } catch {
          console.warn("Fighter load response not valid JSON:", text.slice(0, 200));
          addToast("Invalid fighter data response.");
          return;
        }

        if (data.status === "success" && Array.isArray(data.fighters)) {
          setLocalAllFighters(
            data.fighters.map((f: any) => ({
              FighterId: Number(f.FighterId),
              FighterName: f.FighterName ?? `#${f.FighterId}`,
              ClubAcronym: f.ClubAcronym ?? null,
              ClubId: f.ClubId ?? null,
              Strikes: f.Strikes ?? 0,
            }))
          );
        } else {
          console.warn("Unexpected fighter payload:", data);
          addToast("Failed to load fighters.");
        }
      } catch (err) {
        if (!abort) {
          console.error("Fighter load error:", err);
          addToast("Error loading fighters.");
        }
      }
    })();
    return () => {
      abort = true;
    };
  }, [tournamentId, eventId, addToast]);

  // --- Derived values ---
  const maxScore = Math.max(
    ...localFighters.map((f) =>
      f.FinalScore !== null && f.FinalScore !== undefined ? f.FinalScore : -Infinity
    )
  );
  const hasScores = localFighters.some(
    (f) => typeof f.FinalScore === "number" && f.FinalScore > 0
  );

  // --- API actions ---
  const handleUpdateFighter = async (fighterColor: string, fighterId: number) => {
    try {
      const response = await apiQuery(`${backend_uri}/${match_api}?id=${matchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fighterId, fighterColor }),
      });

      const data = await response.json();
      if (response.ok && data.status === "success") {
        const fighterInfo = localAllFighters.find((f) => f.FighterId === fighterId);
        const updated = localFighters.map((f) =>
          f.FighterColor === fighterColor
            ? {
                ...f,
                FighterId: fighterId,
                FighterName: fighterInfo?.FighterName ?? f.FighterName,
                ClubAcronym: fighterInfo?.ClubAcronym ?? f.ClubAcronym,
              }
            : f
        );
        setLocalFighters(updated);
        onChange?.(matchId, updated);
        addToast(`Updated ${fighterColor} fighter in match ${matchId}`);
      } else {
        addToast("Failed to update fighter.");
      }
    } catch {
      addToast("Failed to update fighter.");
    }
  };

  const handleSwap = async () => {
    try {
      const response = await apiQuery(`${backend_uri}/${match_api}?id=${matchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "swap" }),
      });
      const data = await response.json();
      if (response.ok && data.status === "success") {
        if (localFighters.length === 2) {
          const swapped = [
            { ...localFighters[1], FighterColor: localFighters[0].FighterColor },
            { ...localFighters[0], FighterColor: localFighters[1].FighterColor },
          ];
          setLocalFighters(swapped);
          onChange?.(matchId, swapped);
        }
        addToast(`Swapped fighters in match ${matchId}`);
      } else {
        addToast("Failed to swap fighters.");
      }
    } catch {
      addToast("Failed to swap fighters.");
    }
  };

  const handleComplete = async () => {
    try {
      const response = await apiQuery(`${backend_uri}/${match_api}?id=${matchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      const data = await response.json();
      if (response.ok && data.status === "success") {
        setLocalStatus("D");
        onComplete?.(matchId);
        addToast(`Marked match ${matchId} complete`);
      } else {
        addToast(`Failed to complete match:${data.message}`);
      }
    } catch {
      addToast("Failed to complete match.");
    }
  };

  const handlePending = async () => {
    try {
      const response = await apiQuery(`${backend_uri}/${match_api}?id=${matchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pending" }),
      });
      const data = await response.json();
      if (response.ok && data.status === "success") {
        setLocalStatus("P");
        addToast(`Reopened match ${matchId} as pending`);
      } else {
        addToast("Failed to reopen match.");
      }
    } catch {
      addToast("Failed to reopen match.");
    }
  };

  const handleDelete = async () => {
    onDelete?.(matchId);
    try {
      const response = await apiQuery(`${backend_uri}/${match_api}?id=${matchId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (response.ok && data.status === "success") {
        addToast(`Deleted match ${matchId}`);
      } else {
        throw new Error(data.message || "Failed to delete match.");
      }
    } catch {
      addToast("Error deleting match, rolling back");
    }
  };

  // --- UI helpers ---
  const getMatchCardClass = (status: MatchStatus) => {
    if (status === "A") return "match-card match-table active-match";
    if (status === "D") return "match-card match-table completed-match";
    return "match-card match-table pending-match";
  };

  const readyForRender =
    localFighters.length > 0 &&
    !localFighters.some((f) => !f.FighterName || f.FighterName.trim() === "");

  // --- Render ---
  return (
    <div className={getMatchCardClass(localStatus)}>
      <div className="match-header">
        Match No. {matchNumber} –&nbsp;
        <RingDropdown
          matchId={matchId}
          currentRing={localRing}
          maxRings={maxRings}
          interactive={interactive}
          onChangeRing={(id, newRing) => {
            setLocalRing(newRing);
            onChangeRing?.(id, newRing);
            addToast(`Updated match ${id} to ring ${newRing}`);
          }}
        />
      </div>

      {!readyForRender ? (
        <div style={{ padding: "12px 8px", opacity: 0.8 }}>Loading fighters…</div>
      ) : (
        <div className="fighters">
          {localFighters.map((f) => {
            const isWinner = hasScores && f.FinalScore === maxScore;
            return (
              <div key={`${matchId}-${f.FighterColor}`} className={`fighter-row ${f.FighterColor}`}>
                <FighterDropdown
                  fighter={f}
                  allFighters={localAllFighters}
                  localFighters={localFighters}
                  onUpdate={handleUpdateFighter}
                  interactive={interactive}
                  isWinner={isWinner}
                />
                <span className={`score ${isWinner ? "winner" : ""}`}>
                  {f.FinalScore !== null && f.FinalScore !== undefined
                    ? Number(f.FinalScore).toFixed(2)
                    : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {interactive && (
        <MatchActions
          localStatus={localStatus}
          onSwap={handleSwap}
          onComplete={handleComplete}
          onPending={handlePending}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
};

export default MatchCard;

/**
 * src/components/Manager/matchSubComponents/MatchCard.tsx
 *
 * Portable MatchCard
 * - Falls back to self-loading match + event fighter list if props are incomplete.
 * - Keeps the original props API intact, so existing callers keep working.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Fighter } from "../subComponents/useFighters";
import { backend_uri, match_api, event_fighters_api } from "../../utility/endpoints";
import { useToast } from "../../utility/ToastProvider";
import FighterDropdown from "./fighterDropdown";
import MatchActions from "./matchActions";
import RingDropdown from "./ringDropdown";

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
  fighters: MatchFighterRow[];   // callers can still pass these to populate fighters in match (recommended when available, if not, pass in [])
  status: MatchStatus;
  allFighters: Fighter[];        // callers can still pass these populate fighter swap dropdowns (recommended when available, if not, pass in [])
  ringNo: number;
  matchNumber: number;
  maxRings: number;

  interactive?: boolean;

  onChange?: (matchId: number, updatedFighters: MatchFighterRow[]) => void;
  onDelete?: (matchId: number) => void;
  onComplete?: (matchId: number) => void;
  onChangeRing?: (matchId: number, newRing: number) => void;
}

const EVENT_FIGHTERS_API = `${backend_uri}/${event_fighters_api}`;

const MatchCard: React.FC<MatchCardProps> = ({
  matchId,
  fighters,
  status,
  allFighters,
  ringNo,
  matchNumber,
  maxRings,
  interactive = false,
  onChange,
  onDelete,
  onComplete,
  onChangeRing,
}) => {
  const addToast = useToast();

  // local state mirrors props, but can self-fill if props are incomplete
  const [localFighters, setLocalFighters] = useState<MatchFighterRow[]>(fighters || []);
  const [localStatus, setLocalStatus] = useState<MatchStatus>(status || "P");
  const [localRing, setLocalRing] = useState<number>(typeof ringNo === "number" ? ringNo : 0);

  // optional self-loaded context
  const [eventId, setEventId] = useState<number | null>(null);
  const [localAllFighters, setLocalAllFighters] = useState<Fighter[]>(allFighters || []);
  // keep local state synced when caller updates props later
  useEffect(() => {
    if (fighters && fighters.length) setLocalFighters(fighters);
  }, [fighters]);

  useEffect(() => {
    if (status) setLocalStatus(status);
  }, [status]);

  useEffect(() => {
    if (typeof ringNo === "number") setLocalRing(ringNo);
  }, [ringNo]);

  useEffect(() => {
    if (allFighters && allFighters.length) setLocalAllFighters(allFighters);
  }, [allFighters]);

  // Determine if we need to self-fetch match details
  const needsMatchFetch = useMemo(() => {
    if (!localFighters || localFighters.length < 2) return true;
    // also fetch if names are missing (would blank dropdown labels)
    return localFighters.some(f => !f.FighterName || f.FighterName.trim() === "");
  }, [localFighters]);

  // self-load: fetch match (includes EventId + fighters w/ names)
  useEffect(() => {
    let abort = false;
    (async () => {
      if (!needsMatchFetch) return;
      try {
        const res = await fetch(`${backend_uri}/${match_api}?id=${matchId}`, {
          headers: { Accept: "application/json" },
        });
        const data = await res.json();
        if (abort) return;

        if (res.ok && data.status === "success" && data.match) {
          const m = data.match;
          // match payload includes: fighters[], PendingActiveDone, MatchRingNo, EventId
          setLocalFighters(
            (m.fighters || []).map((f: any) => ({
              FighterId: Number(f.FighterId),
              FighterName: f.FighterName ?? `#${f.FighterId}`,
              ClubAcronym: f.ClubAcronym ?? null,
              FighterColor: f.FighterColor,
              FinalScore: f.FinalScore !== null && f.FinalScore !== undefined ? Number(f.FinalScore) : null,
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

  // self-load: if we still don't have a fighter list for dropdown options, fetch event fighters (needs eventId)
  useEffect(() => {
    let abort = false;
    (async () => {
      if (localAllFighters.length > 0) return;       // caller provided fighters list
      if (!eventId) return;                          // need event context to fetch fighters
      try {
        const res = await fetch(`${EVENT_FIGHTERS_API}?eventId=${encodeURIComponent(eventId)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const data = await res.json();
        if (abort) return;
        if (data.status === "success" && Array.isArray(data.fighters)) {
          // normalize to Fighter[]
          setLocalAllFighters(
            data.fighters.map((f: any) => ({
              FighterId: Number(f.FighterId),
              FighterName: f.FighterName ?? `#${f.FighterId}`,
              ClubAcronym: f.ClubAcronym ?? null,
              ClubId: f.ClubId ?? null,
            }))
          );
        }
      } catch {
        if (!abort) addToast("Failed to load event fighters.");
      }
    })();
    return () => {
      abort = true;
    };
  }, [eventId, localAllFighters.length, addToast]);

  const maxScore = Math.max(
    ...localFighters.map((f) => (f.FinalScore !== null && f.FinalScore !== undefined ? f.FinalScore : -Infinity))
  );
  const hasScores = localFighters.some((f) => typeof f.FinalScore === "number" && f.FinalScore > 0);


  // === API ACTIONS ===
  const handleUpdateFighter = async (fighterColor: string, fighterId: number) => {
    try {
      const response = await fetch(`${backend_uri}/${match_api}?id=${matchId}`, {
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
      const response = await fetch(`${backend_uri}/${match_api}?id=${matchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "swap" }),
      });
      const data = await response.json();
      if (response.ok && data.status === "success") {
        if (localFighters.length === 2) {
          const swapped = [
            {
              ...localFighters[0],
              FighterId: localFighters[1].FighterId,
              FighterName: localFighters[1].FighterName,
              ClubAcronym: localFighters[1].ClubAcronym,
              FinalScore: localFighters[1].FinalScore,
            },
            {
              ...localFighters[1],
              FighterId: localFighters[0].FighterId,
              FighterName: localFighters[0].FighterName,
              ClubAcronym: localFighters[0].ClubAcronym,
              FinalScore: localFighters[0].FinalScore,
            },
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
      const response = await fetch(`${backend_uri}/${match_api}?id=${matchId}`, {
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
        addToast("Failed to complete match.");
      }
    } catch {
      addToast("Failed to complete match.");
    }
  };

  const handlePending = async () => {
    try {
      const response = await fetch(`${backend_uri}/${match_api}?id=${matchId}`, {
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
    // 🔹 Optimistic update first
    onDelete?.(matchId);

    try {
      const response = await fetch(`${backend_uri}/${match_api}?id=${matchId}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (response.ok && data.status === "success") {
        addToast(`Deleted match ${matchId}`);
      } else {
        throw new Error(data.message || "Failed to delete match.");
      }
    } catch (err) {
      addToast("Error deleting match, rolling back");

      // 🔹 Rollback if backend fails
      if (fighters && fighters.length) {
        setLocalFighters(fighters);
        setLocalStatus(status);
        setLocalRing(ringNo);
      }
    }
  };


  const getMatchCardClass = (status: MatchStatus) => {
    if (status === "A") return "match-card match-table active-match";
    if (status === "D") return "match-card match-table completed-match";
    return "match-card match-table pending-match";
  };

  // Loading guard: if we still don't have fighters with names OR dropdown options list, show loader
  const readyForRender =
    localFighters.length > 0 &&
    !localFighters.some((f) => !f.FighterName || f.FighterName.trim() === "");

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
        <div style={{ padding: "12px 8px", opacity: 0.8 }}>Match Pending</div>
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
                  isWinner={isWinner}   // 🔹 now passed down
                />
                <span
                  className={`score ${isWinner ? "winner" : ""}`}
                >
                  {f.FinalScore !== null && f.FinalScore !== undefined ? Number(f.FinalScore).toFixed(2) : ""}
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

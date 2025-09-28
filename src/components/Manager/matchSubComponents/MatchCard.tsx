import React, { useState } from "react";
import { Fighter } from "../subComponents/useFighters";
import { backend_uri, match_api } from "../../utility/endpoints";
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
  fighters: MatchFighterRow[];
  status: MatchStatus;
  allFighters: Fighter[];
  ringNo: number;
  matchNumber: number;
  maxRings: number; // <-- NEW: dynamic max rings passed in

  interactive?: boolean;

  onChange?: (matchId: number, updatedFighters: MatchFighterRow[]) => void;
  onDelete?: (matchId: number) => void;
  onComplete?: (matchId: number) => void;
  onChangeRing?: (matchId: number, newRing: number) => void;
}

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
  const [localFighters, setLocalFighters] = useState<MatchFighterRow[]>(fighters);
  const [localStatus, setLocalStatus] = useState<MatchStatus>(status);
  const [localRing, setLocalRing] = useState<number>(ringNo);

  const maxScore = Math.max(...localFighters.map((f) => f.FinalScore ?? 0));
  const winners = localFighters.filter((f) => (f.FinalScore ?? 0) === maxScore);

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
        const fighterInfo = allFighters.find((f) => f.FighterId === fighterId);
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
    try {
      const response = await fetch(`${backend_uri}/${match_api}?id=${matchId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (response.ok && data.status === "success") {
        onDelete?.(matchId);
        addToast(`Deleted match ${matchId}`);
      } else {
        addToast("Failed to delete match.");
      }
    } catch {
      addToast("Failed to delete match.");
    }
  };

  // === RENDER ===
  const getMatchCardClass = (status: MatchStatus) => {
    if (status === "A") return "match-card match-table active-match";
    if (status === "D") return "match-card match-table completed-match";
    return "match-card match-table pending-match";
  };

  return (
    <div className={getMatchCardClass(localStatus)}>
      <div className="match-header">
        Match No. {matchNumber} –
        <RingDropdown
          matchId={matchId}
          currentRing={localRing}
          maxRings={maxRings} // <-- dynamic now
          interactive={interactive}
          onChangeRing={(id, newRing) => {
            setLocalRing(newRing);
            onChangeRing?.(id, newRing);
            addToast(`Updated match ${id} to ring ${newRing}`);
          }}
        />
      </div>

      <div className="fighters">
        {localFighters.map((f) => {
          const isWinner = winners.some((w) => w.FighterId === f.FighterId);
          return (
            <div key={`${matchId}-${f.FighterColor}`} className={`fighter-row ${f.FighterColor}`}>
              <FighterDropdown
                fighter={f}
                allFighters={allFighters}
                localFighters={localFighters}
                onUpdate={handleUpdateFighter}
                interactive={interactive}
              />
              <span className={`score ${isWinner ? "winner" : ""}`}>
                {f.FinalScore ?? 0}
              </span>
            </div>
          );
        })}
      </div>

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

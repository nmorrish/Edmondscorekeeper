/**
 * src/components/Manager/fighterSubComponents/FighterEntryForm.tsx
 *
 * === Fighter Entry Row (Single-Line) ===
 * Unified component for fighters.
 * Handles create/update/delete only.
 * Tournament/event forms own add/remove buttons.
 */

import React, { useState } from "react";
import { backend_uri, fighter_api } from "../../utility/endpoints";
import { useToast } from "../../utility/ToastProvider";
import { Fighter } from "../subComponents/useFighters";

export interface Club {
  ClubId: number;
  ClubName: string;
  ClubAcronym?: string | null;
}

interface FighterEntryFormProps {
  fighter?: Fighter;
  clubs: Club[];
  tournamentId: number;
  tournamentName: string;
  inTournament?: boolean; // used only for parent context
  context?: "tournament" | "event";
}

const FighterEntryForm: React.FC<FighterEntryFormProps> = ({
  fighter,
  clubs,
  // tournamentId,
  // inTournament = false,
  // context = "tournament",
}) => {
  const addToast = useToast();
  const isNew = !fighter;

  const [editing, setEditing] = useState<boolean>(isNew);
  const [name, setName] = useState<string>(fighter?.FighterName ?? "");
  const [clubId, setClubId] = useState<number | null>(fighter?.ClubId ?? null);

  // Helper: display acronym (fallback to name)
  const getClubDisplay = (): string => {
    if (clubId == null) return "—";
    const club = clubs.find((c) => c.ClubId === clubId);
    return (club?.ClubAcronym && club.ClubAcronym.trim()) || club?.ClubName || "—";
  };

  const handleSave = async () => {
    if (!name.trim()) {
      addToast("Fighter name is required");
      return;
    }

    try {
      if (isNew) {
        // Create fighter
        const res = await fetch(`${backend_uri}/${fighter_api}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fighterName: name.trim(),
            clubId,
          }),
        });
        const data = await res.json();

        if (data.status === "success") {
          addToast("Fighter created");
          setName("");
          setClubId(null);
        } else {
          addToast(`Error: ${data.message}`);
        }
      } else {
        // Update fighter
        const res = await fetch(
          `${backend_uri}/${fighter_api}?id=${fighter!.FighterId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fighterName: name.trim(),
              clubId,
            }),
          }
        );
        const data = await res.json();
        if (data.status === "success") {
          addToast("Fighter updated");
          setEditing(false);
        } else {
          addToast(`Error: ${data.message}`);
        }
      }
    } catch (err) {
      console.error("Error saving fighter", err);
      addToast("Error saving fighter");
    }
  };

  const handleDelete = async () => {
    if (!fighter) return;
    if (!window.confirm("Are you sure you want to delete this fighter?")) return;

    try {
      const res = await fetch(`${backend_uri}/${fighter_api}?id=${fighter.FighterId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.status === "success") {
        addToast("Fighter deleted");
      } else {
        addToast(`Error: ${data.message}`);
      }
    } catch (err) {
      console.error("Error deleting fighter", err);
      addToast("Error deleting fighter");
    }
  };

  const handleCancel = () => {
    if (isNew) {
      setName("");
      setClubId(null);
    } else {
      setName(fighter!.FighterName);
      setClubId(fighter!.ClubId);
      setEditing(false);
    }
  };

  return (
    <div className="fighter-entry-row">
      {/* Fighter name */}
      <div>
        {editing ? (
          <input
            type="text"
            placeholder="Fighter Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        ) : (
          <span className="fighter-name">{fighter?.FighterName}</span>
        )}
      </div>

      {/* Club */}
      <div>
        {editing ? (
          <select
            value={clubId ?? ""}
            onChange={(e) =>
              setClubId(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">No Club</option>
            {clubs.map((c) => (
              <option key={c.ClubId} value={c.ClubId}>
                {c.ClubAcronym ? `${c.ClubAcronym} — ${c.ClubName}` : c.ClubName}
              </option>
            ))}
          </select>
        ) : (
          <span className="club-display">{getClubDisplay()}</span>
        )}
      </div>

      {/* Edit/Save + Cancel */}
      <div>
        {editing ? (
          <>
            <button onClick={handleSave}>Save</button>
            {!isNew && <button onClick={handleCancel}>Cancel</button>}
          </>
        ) : (
          <button onClick={() => setEditing(true)}>Edit</button>
        )}
      </div>

      {/* Delete button (only in edit mode, existing fighters) */}
      {editing && !isNew && (
        <div>
          <button onClick={handleDelete} className="delete-button" title="Delete fighter">
            🗑️
          </button>
        </div>
      )}
    </div>
  );
};

export default FighterEntryForm;

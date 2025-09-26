/**
 * src/components/Manager/fighterSubComponents/FighterEntryForm.tsx
 *
 * === Fighter Entry Row (Single-Line) ===
 * Unified component for fighters.
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
  inTournament?: boolean;
  onUpdated: () => void;
}

const FighterEntryForm: React.FC<FighterEntryFormProps> = ({
  fighter,
  clubs,
  tournamentId,
  inTournament = false,
  onUpdated,
}) => {
  const addToast = useToast();
  const isNew = !fighter;

  const [editing, setEditing] = useState<boolean>(isNew);
  const [name, setName] = useState<string>(fighter?.FighterName ?? "");
  const [clubId, setClubId] = useState<number | null>(fighter?.ClubId ?? null);
  const [addToTournament, setAddToTournament] = useState<boolean>(true);

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
        // 1. Create fighter
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

          // 2. If checkbox ticked → add to tournament
          if (addToTournament && data.fighterId) {
            try {
              const res2 = await fetch(`${backend_uri}/tournamentFightersApi.php`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  tournamentId,
                  fighterId: data.fighterId,
                }),
              });
              const data2 = await res2.json();
              if (data2.status === "success") {
                addToast("Fighter also added to tournament");
              } else {
                addToast(`Fighter created but not added to tournament: ${data2.message}`);
              }
            } catch (err) {
              console.error("Error adding fighter to tournament", err);
              addToast("Fighter created but tournament add failed");
            }
          }

          setName("");
          setClubId(null);
          setAddToTournament(true);
          onUpdated();
        } else {
          addToast(`Error: ${data.message}`);
        }
      } else {
        // Update existing fighter
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
          onUpdated();
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
        onUpdated();
      } else {
        addToast(`Error: ${data.message}`);
      }
    } catch (err) {
      console.error("Error deleting fighter", err);
      addToast("Error deleting fighter");
    }
  };

  const toggleTournament = async () => {
    if (!fighter) return;

    try {
      let res;
      if (inTournament) {
        res = await fetch(
          `${backend_uri}/tournamentFightersApi.php?tournamentId=${tournamentId}&fighterId=${fighter.FighterId}`,
          { method: "DELETE" }
        );
      } else {
        res = await fetch(`${backend_uri}/tournamentFightersApi.php`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tournamentId, fighterId: fighter.FighterId }),
        });
      }

      const data = await res.json();
      if (data.status === "success") {
        addToast(inTournament ? "Removed from tournament" : "Added to tournament");
        onUpdated();
      } else {
        addToast(`Error: ${data.message}`);
      }
    } catch (err) {
      console.error("Error toggling tournament", err);
      addToast("Error toggling tournament");
    }
  };

  const handleCancel = () => {
    if (isNew) {
      setName("");
      setClubId(null);
      setAddToTournament(true);
    } else {
      setName(fighter!.FighterName);
      setClubId(fighter!.ClubId);
      setEditing(false);
    }
  };

  return (
    <div
      className="fighter-entry-row"
      style={{
        display: "grid",
        gridTemplateColumns: inTournament
          ? "2fr 1fr auto auto auto" // name | club | save | cancel | delete (edit mode)
          : "auto 2fr 1fr auto auto", // add | name | club | edit/save | delete
        gap: "0.5rem",
        alignItems: "center",
        borderBottom: "1px solid #444",
        padding: "0.4rem 0",
      }}
    >
      {/* Add button on far left (only when OUT) */}
      {!isNew && !inTournament && (
        <div>
          <button onClick={toggleTournament}>← Add</button>
        </div>
      )}

      {/* Fighter name */}
      <div>
        {editing ? (
          <input
            type="text"
            placeholder="Fighter Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        ) : (
          <span style={{ fontWeight: 600 }}>{fighter?.FighterName}</span>
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
            style={{ width: "50%" }}
          >
            <option value="">No Club</option>
            {clubs.map((c) => (
              <option key={c.ClubId} value={c.ClubId}>
                {c.ClubAcronym ? `${c.ClubAcronym} — ${c.ClubName}` : c.ClubName}
              </option>
            ))}
          </select>
        ) : (
          <span style={{ opacity: 0.8 }}>{getClubDisplay()}</span>
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
          <button onClick={handleDelete} style={{ color: "red" }} title="Delete fighter">
            🗑️
          </button>
        </div>
      )}

      {/* Remove button on far right (only when IN) */}
      {!isNew && inTournament && !editing && (
        <div style={{ textAlign: "right" }}>
          <button onClick={toggleTournament}>Remove →</button>
        </div>
      )}
    </div>
  );
};

export default FighterEntryForm;

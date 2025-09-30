/**
 * src/components/Manager/fighterSubComponents/ClubEntryForm.tsx
 *
 * === Club Entry Row (Single-Line) ===
 * A single compact row for one club with inline edit + save, or a blank "new club" row.
 *
 * - If `club` prop is provided, renders that club (view mode by default, Edit -> Save).
 * - If `club` is omitted, renders empty inputs for creating a new club (edit mode).
 * - Omits ClubLogo in the UI (stretch goal).
 *
 */

import React, { useState } from "react";
import { backend_uri, club_api } from "../../utility/endpoints";
import { useToast } from "../../utility/ToastProvider";

export interface Club {
  ClubId: number;
  ClubName: string;
  ClubAcronym: string | null;
  // ClubLogo is intentionally omitted in UI for now
}

interface ClubEntryFormProps {
  club?: Club;                 // if omitted => create-new row
  onClubsUpdated: () => void;  // parent refresher
}

const ClubEntryForm: React.FC<ClubEntryFormProps> = ({ club, onClubsUpdated }) => {
  const addToast = useToast();
  const isNew = !club;

  const [editing, setEditing] = useState<boolean>(isNew); // new row starts in edit mode
  const [name, setName] = useState<string>(club?.ClubName ?? "");
  const [acronym, setAcronym] = useState<string>(club?.ClubAcronym ?? "");

  const handleSave = async () => {
    if (!name.trim()) {
      addToast("Club name is required");
      return;
    }
    try {
      if (isNew) {
        const res = await fetch(`${backend_uri}/${club_api}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clubName: name.trim(), clubAcronym: acronym || null }),
        });
        const data = await res.json();
        if (data.status === "success") {
          addToast("Club created");
          setName("");
          setAcronym("");
          onClubsUpdated();
        } else {
          addToast(`Error: ${data.message}`);
        }
      } else {
        const res = await fetch(`${backend_uri}/${club_api}?id=${club!.ClubId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clubName: name.trim(), clubAcronym: acronym || null }),
        });
        const data = await res.json();
        if (data.status === "success") {
          addToast("Club updated");
          setEditing(false);
          onClubsUpdated();
        } else {
          addToast(`Error: ${data.message}`);
        }
      }
    } catch (e) {
      console.error("Error saving club", e);
      addToast("Error saving club");
    }
  };

  const handleDelete = async () => {
    if (isNew) {
      // Just clear new row fields
      setName("");
      setAcronym("");
      return;
    }
    if (!window.confirm("Delete this club?")) return;
    try {
      const res = await fetch(`${backend_uri}/${club_api}?id=${club!.ClubId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.status === "success") {
        addToast("Club deleted");
        onClubsUpdated();
      } else {
        addToast(`Error: ${data.message}`);
      }
    } catch (e) {
      console.error("Error deleting club", e);
      addToast("Error deleting club");
    }
  };

  // Single-line layout
  return (
    <div
      className="club-entry-row"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 160px auto auto auto",
        gap: "0.5rem",
        alignItems: "center",
        padding: "0.4rem 0",
        borderBottom: "1px solid #e5e7eb",
      }}
    >
      {/* Name */}
      <div>
        {editing ? (
          <input
            type="text"
            placeholder="Club Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        ) : (
          <span style={{ fontWeight: 600 }}>{club?.ClubName}</span>
        )}
      </div>

      {/* Acronym */}
      <div>
        {editing ? (
          <input
            type="text"
            placeholder="Acronym"
            value={acronym}
            onChange={(e) => setAcronym(e.target.value)}
            maxLength={10}
          />
        ) : (
          <span style={{ opacity: 0.8 }}>{club?.ClubAcronym || ""}</span>
        )}
      </div>

      {/* Edit/Save */}
      <div>
        {editing ? (
          <button onClick={handleSave}>Save</button>
        ) : (
          <button onClick={() => setEditing(true)}>Edit</button>
        )}
      </div>

      {/* Delete */}
      <div>
        <button onClick={handleDelete}>{isNew ? "Clear" : "Delete"}</button>
      </div>
    </div>
  );
};

export default ClubEntryForm;

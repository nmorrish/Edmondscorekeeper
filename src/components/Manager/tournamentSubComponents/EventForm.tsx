import React, { useState, useEffect } from "react";
import { backend_uri, event_api } from "../../utility/endpoints";
import useWeapons from "./useWeapons";
import type { Event } from "./useEvent";

interface Props {
  event: Event | null;              // null → add new
  tournamentId: number;             // passed from TournamentForm
  onClose: () => void;
  onSaved: () => void;
  onCreated?: (newId: number) => void; 
}

const EventForm: React.FC<Props> = ({ event, tournamentId, onClose, onSaved, onCreated }) => {
  const { weapons } = useWeapons(); // already working elsewhere
  const [formData, setFormData] = useState({
    name: event?.name ?? "",
    rules: event?.rules ?? "",
    weaponId: event?.weaponId ?? 0,
    tournamentId: event?.tournamentId || tournamentId,
    maxRings: event?.maxRings ?? 1, 
  });

  // Keep tournamentId locked to parent
  useEffect(() => {
    if (!event) {
      setFormData((prev) => ({ ...prev, tournamentId }));
    }
  }, [event, tournamentId]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        name === "weaponId" || name === "tournamentId" || name === "maxRings"
          ? Number(value)
          : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (!formData.weaponId || !formData.tournamentId) {
        alert("Please select a weapon and ensure tournament is set.");
        return;
      }

      const method = event ? "PUT" : "POST";
      const url = event
        ? `${backend_uri}/${event_api}?id=${event.id}`   
        : `${backend_uri}/${event_api}`;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { status: "error", message: text }; }

      if (res.ok && data.status === "success") {
        onSaved();
        if (!event && data.id && onCreated) {
          onCreated(data.id); // 👈 scroll after creating new
        }
        onClose();
      } else {
        alert("Error: " + (data.message || "Failed to save event."));
      }
    } catch {
      alert("Failed to save event.");
    }
  };

  const handleDelete = async () => {
    if (!event) return;
    if (!window.confirm("Delete this event?")) return;

    try {
      const res = await fetch(`${backend_uri}/${event_api}?id=${event.id}`, { method: "DELETE" });
      const text = await res.text();
      let data: any; try { data = JSON.parse(text); } catch { data = { status: "error", message: text }; }

      if (res.ok && data.status === "success") {
        onSaved();
        onClose();
      } else {
        alert("Error: " + (data.message || "Failed to delete event."));
      }
    } catch {
      alert("Failed to delete event.");
    }
  };

  return (
    <div className="tournament-form">
      <h4>{event ? `Edit ${formData.name}` : "Add Event"}</h4>
      <form onSubmit={handleSubmit}>
        <label>
          Event Name:
          <input name="name" value={formData.name} onChange={handleChange} required />
        </label>

        <label>
          Rules Specific to Event:
          <textarea name="rules" value={formData.rules} onChange={handleChange} required />
        </label>

        <label>
          Weapon for Event:
          <select name="weaponId" value={formData.weaponId} onChange={handleChange} required>
            <option value={0}>-- Select Weapon --</option>
            {weapons.map((w) => (
              <option key={w.WeaponId} value={w.WeaponId}>
                {w.WeaponName}
              </option>
            ))}
          </select>
        </label>

        <label>
          Max Rings:
          <input
            type="number"
            name="maxRings"
            value={formData.maxRings}
            onChange={handleChange}
            min={1}
            required
          />
        </label>

        {/* Hidden (locked to parent tournament) */}
        <input type="hidden" name="tournamentId" value={formData.tournamentId} />

        <div className="form-actions">
          <button type="submit">{event ? "Save" : "Create"}</button>
          {event && (
            <button type="button" onClick={handleDelete} className="delete-button">
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default EventForm;

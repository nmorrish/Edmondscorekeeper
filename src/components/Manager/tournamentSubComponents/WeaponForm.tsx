/**
 * src/components/Manager/tournamentSubComponents/WeaponForm.tsx
 *
 * Mirrors TournamentForm:
 * - Form state uses lowercase JSON keys: name, weaponRequirements, gearRequirements
 * - PHP maps these to DB fields (WeaponName, WeaponRequirements, GearRequirements)
 */

import React, { useState } from "react";
import { backend_uri, weapon_api } from "../../utility/endpoints";
import { Weapon } from "./useWeapons";
import { apiQuery } from "../../utility/apiClient";

interface Props {
  weapon: Weapon | null;  // null → add new
  onClose: () => void;
  onSaved: () => void;
}

const WeaponForm: React.FC<Props> = ({ weapon, onClose, onSaved }) => {
  const [formData, setFormData] = useState({
    name: weapon?.WeaponName || "",
    weaponRequirements: weapon?.WeaponRequirements || "",
    gearRequirements: weapon?.GearRequirements || "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    // name MUST match keys above: name | weaponRequirements | gearRequirements
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const method = weapon ? "PUT" : "POST";
      const url = weapon
        ? `${backend_uri}/${weapon_api}?id=${weapon.WeaponId}`
        : `${backend_uri}/${weapon_api}`;

      const res = await apiQuery(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (data.status === "success") {
        onSaved();
        onClose();
      } else {
        alert("Error: " + (data.message || "Failed to save weapon."));
      }
    } catch {
      alert("Failed to save weapon.");
    }
  };

  const handleDelete = async () => {
    if (!weapon) return;
    if (!window.confirm("Delete this weapon?")) return;

    try {
      const res = await apiQuery(
        `${backend_uri}/${weapon_api}?id=${weapon.WeaponId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.status === "success") {
        onSaved();
        onClose();
      } else {
        alert("Error: " + (data.message || "Failed to delete weapon."));
      }
    } catch {
      alert("Failed to delete weapon.");
    }
  };

  return (
    <div className="tournament-form">
      <h3>{weapon ? "Edit Weapon" : "Add Weapon"}</h3>
      <form onSubmit={handleSubmit}>
        <label>
          Name:
          <input
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </label>

        <label>
          Weapon Requirements:
          <textarea
            name="weaponRequirements"
            value={formData.weaponRequirements}
            onChange={handleChange}
            required
          />
        </label>

        <label>
          Gear Requirements:
          <textarea
            name="gearRequirements"
            value={formData.gearRequirements}
            onChange={handleChange}
            required
          />
        </label>

        <div className="form-actions">
          <button type="submit">{weapon ? "Save" : "Create"}</button>
          {weapon && (
            <button
              type="button"
              onClick={handleDelete}
              className="delete-button"
            >
              Delete
            </button>
          )}
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
};

export default WeaponForm;

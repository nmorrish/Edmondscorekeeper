/**
 * src/components/Manager/tournamentSubComponents/useWeapons.tsx
 *
 * == Weapons Hook ==
 * Mirrors useTournaments: expects envelope { status, weapons } from PHP.
 */

import { useState, useEffect } from "react";
import { backend_uri, weapon_api } from "../../utility/endpoints";
import { apiQuery } from "../../utility/apiClient";

export interface Weapon {
  WeaponId: number;
  WeaponName: string;
  WeaponRequirements: string;
  GearRequirements: string;
}

const useWeapons = (refreshKey: number = 0) => {
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWeapons = async () => {
      try {
        setLoading(true);
        const res = await apiQuery(`${backend_uri}/${weapon_api}`);
        const data = await res.json();

        if (data.status === "success") {
          setWeapons(data.weapons || []);
        } else {
          setError(data.message || "Failed to fetch weapons.");
        }
      } catch (err) {
        setError("Failed to fetch weapons.");
      } finally {
        setLoading(false);
      }
    };

    fetchWeapons();
  }, [refreshKey]);

  return { weapons, loading, error };
};

export default useWeapons;

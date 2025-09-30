/**
 * src/components/Manager/subComponents/useFighters.ts
 *
 * == List Fighters Hook ==
 * Fetches fighters from backend API.
 * Returns fighters with DB-shaped fields (FighterId, FighterName, etc.)
 */

import { useState, useCallback } from "react";
import { backend_uri, fighter_api } from "../../utility/endpoints";

export interface Fighter {
  FighterId: number;
  FighterName: string;
  ClubId: number | null;
  ClubName: string | null;
  ClubAcronym?: string | null;
  TournamentId?: number;
  Strikes?: number;
  FighterPortrait?: string | null;
}

const useFighters = () => {
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // take tournamentId as a parameter here
  const fetchFighterData = useCallback(async (tournamentId?: number) => {
    if (!tournamentId) {
      setFighters([]);
      return;
    }

    try {
      setLoading(true);
      const qs = `?tournamentId=${tournamentId}`;
      const res = await fetch(`${backend_uri}/${fighter_api}${qs}`);
      const text = await res.text();

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text || "Invalid JSON");
      }

      if (res.ok && data.status === "success" && Array.isArray(data.fighters)) {

        const mapped: Fighter[] = data.fighters.map((f: any) => ({
          FighterId: f.FighterId ?? f.fighterId,
          FighterName: f.FighterName ?? f.fighterName,
          ClubId: f.ClubId ?? f.clubId ?? null,
          ClubName: f.ClubName ?? f.clubName ?? null,
          ClubAcronym: f.ClubAcronym ?? f.clubAcronym ?? null,
          TournamentId: f.TournamentId ?? f.tournamentId ?? undefined,
          Strikes: f.Strikes ?? f.strikes ?? 0,
          FighterPortrait: f.FighterPortrait ?? f.fighterPortrait ?? null,
        }));

        setFighters(mapped);
        setError(null);
      } else {
        throw new Error(data.message || "Failed to fetch fighters.");
      }
    } catch (err: any) {
      console.error("Error fetching fighters:", err);
      setError(err.message || "Failed to fetch fighters.");
      setFighters([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { fighters, loading, error, fetchFighterData };
};

export default useFighters;

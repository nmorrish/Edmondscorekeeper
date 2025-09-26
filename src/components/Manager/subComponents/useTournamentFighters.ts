/**
 * src/components/Manager/subComponents/useTournamentFighters.ts
 *
 * == Tournament Fighters Hook ==
 * Fetches fighters registered to a specific tournament.
 * Uses tournamentFightersApi.php instead of fighter_api.php.
 */

import { useState, useEffect, useCallback } from "react";
import { backend_uri } from "../../utility/endpoints";
import { useRefresh } from "../../utility/RefreshContext";
import { Fighter } from "./useFighters"; // reuse Fighter interface

const useTournamentFighters = (tournamentId?: number) => {
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { refreshKey } = useRefresh();

  const fetchTournamentFighters = useCallback(async () => {
    if (!tournamentId) {
      setFighters([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(
        `${backend_uri}/tournamentFightersApi.php?tournamentId=${tournamentId}`
      );
      const text = await response.text();

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text || "Invalid JSON from tournamentFightersApi");
      }

      if (response.ok && data.status === "success") {
        const mapped: Fighter[] = data.fighters.map((f: any) => ({
          FighterId: f.FighterId,
          FighterName: f.FighterName,
          ClubId: f.ClubId ?? null,
          ClubName: f.ClubName ?? null,
          ClubAcronym: f.ClubAcronym ?? null,
          TournamentId: f.TournamentId ?? undefined,
          Strikes: f.Strikes ?? 0,
        }));
        setFighters(mapped);
        setError(null);
      } else {
        throw new Error(data.message || "Failed to fetch tournament fighters.");
      }
    } catch (err: any) {
      console.error("Error fetching tournament fighters:", err);
      setError(err.message || "Failed to fetch tournament fighters.");
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchTournamentFighters();
  }, [fetchTournamentFighters, refreshKey]);

  return { fighters, loading, error, fetchTournamentFighters };
};

export default useTournamentFighters;

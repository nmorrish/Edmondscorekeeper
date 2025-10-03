import { useState, useEffect } from "react";
import { backend_uri, tournament_api } from "../../utility/endpoints";
import { apiQuery } from "../../utility/apiClient";

export interface Tournament {
  TournamentId: number;
  TournamentName: string;
  TournamentStartDate: string;
  TournamentEndDate: string;
  TournamentDescription: string;
  TournamentRules: string;
}

const useTournaments = (refreshKey: number = 0) => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        setLoading(true);
        const response = await apiQuery(`${backend_uri}/${tournament_api}`);
        const data = await response.json();

        if (data.status === "success") {
          setTournaments(data.tournaments);
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError("Failed to fetch tournaments.");
      } finally {
        setLoading(false);
      }
    };

    fetchTournaments();
  }, [refreshKey]); // re-run when refreshKey changes

  return { tournaments, loading, error };
};

export default useTournaments;

/**
 * src/components/Manager/subComponents/useMatches.ts
 *
 * == Matches Hook ==
 * Fetch matches by eventId or matchId.
 * Normalizes fighters into canonical shape.
 */

import { useState, useEffect, useCallback } from "react";
import { backend_uri, match_api } from "../../utility/endpoints";
import { useRefresh } from "../../utility/RefreshContext";
import { apiQuery } from "../../utility/apiClient";

export type MatchStatus = "P" | "A" | "D"; // Pending, Active, Done

export interface MatchFighterRow {
  FighterId: number;
  FighterName: string;
  ClubAcronym?: string | null;
  FighterColor: string; // "Red", "Blue", etc.
  FinalScore?: number;
}

export interface Match {
  MatchId: number;
  EventId: number;
  MatchRingNo: number;
  PendingActiveDone: MatchStatus;
  lastMatchJudgement: string;
  fighters: MatchFighterRow[];
}

const useMatches = (eventId?: number, matchId?: number) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { refreshKey } = useRefresh();

  const fetchMatches = useCallback(async () => {
    if (!eventId && !matchId) {
      setMatches([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const qs = matchId ? `?id=${matchId}` : `?eventId=${eventId}`;
      const response = await apiQuery(`${backend_uri}/${match_api}${qs}`);
      const data = await response.json();

      if (response.ok && data.status === "success") {
        const rawMatches = matchId ? [data.match] : data.matches;

        const normalized: Match[] = rawMatches.map((m: any) => ({
          MatchId: m.MatchId,
          EventId: m.EventId,
          MatchRingNo: m.MatchRingNo,
          PendingActiveDone: m.PendingActiveDone as MatchStatus,
          lastMatchJudgement: m.lastMatchJudgement,
          fighters: (m.fighters || []).map((f: any) => ({
            FighterId: f.FighterId ?? f.fighterId,
            FighterName: f.FighterName ?? f.fighterName,
            ClubAcronym: f.ClubAcronym ?? f.clubAcronym ?? null,
            FighterColor: f.FighterColor ?? f.fighterColor,
            FinalScore: f.FinalScore ?? f.finalScore ?? 0,
          })),
        }));

        setMatches(normalized);
        setError(null);
      } else {
        throw new Error(data.message || "Failed to fetch matches.");
      }
    } catch (err: any) {
      console.error("Error fetching matches:", err);
      setError(err.message || "Failed to fetch matches.");
    } finally {
      setLoading(false);
    }
  }, [eventId, matchId]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches, refreshKey]);

  return { matches, loading, error, fetchMatches };
};

export default useMatches;

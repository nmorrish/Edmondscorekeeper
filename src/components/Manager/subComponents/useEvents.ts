/**
 * src/components/Manager/subComponents/useEvents.ts
 * 
 * == List Events Hook ==
 * Fetch events from backend API.
 * Supports optional tournamentId filtering.
 * Returns DB-shaped fields (EventId, EventName, etc.)
 */

import { useState, useEffect } from "react";
import { backend_uri, event_api } from "../../utility/endpoints";

export interface Event {
  EventId: number;
  EventName: string;
  EventRules: string;
  WeaponId: number;
  TournamentId: number;
  WeaponName?: string;
  TournamentName?: string;
  MaxRings: number;
}

const useEvents = (refreshKey: number = 0, tournamentId?: number) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const qs = tournamentId ? `?tournamentId=${tournamentId}` : "";
        const response = await fetch(`${backend_uri}/${event_api}${qs}`);
        const data = await response.json();

        if (response.ok && data.status === "success") {
          setEvents(data.events);
          setError(null);
        } else {
          setError(data.message || "Failed to fetch events.");
        }
      } catch (err) {
        console.error("Error fetching events:", err);
        setError("Failed to fetch events.");
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [refreshKey, tournamentId]);

  return { events, loading, error };
};

export default useEvents;

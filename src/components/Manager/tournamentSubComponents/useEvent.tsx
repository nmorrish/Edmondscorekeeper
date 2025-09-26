/**
 * src/components/Manager/tournamentSubComponents/useEvent.tsx
 * Fetch events with the same wrapped shape as tournaments/weapons.
 * Supports optional tournamentId filtering to reduce payload.
 */

import { useState, useEffect } from "react";
import { backend_uri, event_api } from "../../utility/endpoints";

export interface Event {
  id: number;
  name: string;
  rules: string;
  weaponId: number;
  tournamentId: number;
  maxRings: number; 
}

const useEvents = (refreshKey: number = 0, tournamentId?: number) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const qs = tournamentId ? `?tournamentId=${tournamentId}` : "";
        const res = await fetch(`${backend_uri}/${event_api}${qs}`);
        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { throw new Error(text || "Invalid JSON"); }

        if (res.ok && data.status === "success") {
          const mapped: Event[] = data.events.map((e: any) => ({
            id: e.EventId,
            name: e.EventName,
            rules: e.EventRules,
            weaponId: e.WeaponId,
            tournamentId: e.TournamentId,
            maxRings: e.MaxRings
          }));
          setEvents(mapped);
        } else {
          throw new Error(data.message || "Failed to fetch events.");
        }
      } catch (err: any) {
        setError(err.message || "Failed to fetch events.");
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [refreshKey, tournamentId]);

  return { events, loading, error };
};

export default useEvents;

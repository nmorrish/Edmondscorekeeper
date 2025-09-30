/**
 * src/components/Viewer/EventStandings.tsx
 *
 * === Public Event Standings Viewer ===
 * Read-only view of tournament standings per event.
 * - TournamentId pulled from URL
 * - Fetches tournament + events list
 * - Event selector buttons across the top (styled same as FighterManagement)
 * - Standings table for selected event
 */

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { backend_uri, tournament_api, event_api } from "../utility/endpoints";

interface EventSummary {
  EventId: number;
  EventName: string;
}

interface StandingRow {
  fighterId: number;
  name: string;
  club: string | null;
  wins: number;
  losses: number;
  draws: number;
  points: number;
}

type SortKey = keyof StandingRow;

const EventStandings: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>();

  const [tournamentName, setTournamentName] = useState<string>("");
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortAsc, setSortAsc] = useState<boolean>(false); // default: highest points first
  const [loading, setLoading] = useState<boolean>(false);

  // ---------- Fetch Tournament ----------
  const fetchTournament = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const resp = await fetch(`${backend_uri}/${tournament_api}?id=${tournamentId}`);
      const data = await resp.json();
      if (data.status === "success" && data.tournament) {
        setTournamentName(data.tournament.TournamentName);
      }
    } catch (err) {
      console.error("Error fetching tournament:", err);
    }
  }, [tournamentId]);

  // ---------- Fetch Events ----------
  const fetchEvents = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const resp = await fetch(`${backend_uri}/${event_api}?tournamentId=${tournamentId}`);
      const data = await resp.json();
      if (data.status === "success" && Array.isArray(data.events)) {
        setEvents(data.events);
        if (data.events.length > 0) {
          setSelectedEventId(data.events[0].EventId); // default to first event
        }
      } else {
        setEvents([]);
      }
    } catch (err) {
      console.error("Error fetching events:", err);
      setEvents([]);
    }
  }, [tournamentId]);

  // ---------- Fetch Standings for Event ----------
  const fetchStandings = useCallback(
    async (eventId: number) => {
      if (!tournamentId || !eventId) return;
      try {
        setLoading(true);
        const resp = await fetch(
          `${backend_uri}/viewerStandings.php?tournamentId=${tournamentId}&eventId=${eventId}`
        );
        const data = await resp.json();
        if (data.status === "success" && Array.isArray(data.standings)) {
          setStandings(data.standings);
        } else {
          setStandings([]);
        }
      } catch (err) {
        console.error("Error fetching standings:", err);
        setStandings([]);
      } finally {
        setLoading(false);
      }
    },
    [tournamentId]
  );

  // ---------- Effects ----------
  useEffect(() => {
    fetchTournament();
    fetchEvents();
  }, [fetchTournament, fetchEvents]);

  useEffect(() => {
    if (selectedEventId) {
      fetchStandings(selectedEventId);
    }
  }, [selectedEventId, fetchStandings]);

  // ---------- Sorting ----------
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortedStandings = [...standings].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];

    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortAsc ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });

  // ---------- Render ----------
  return (
    <div style={{ padding: "1.5rem" }}>
      <h1 style={{ marginBottom: "1rem" }}>
        {tournamentName || "Tournament"} – Standings
      </h1>

      {/* Event Selector */}
      {events.length > 0 && (
        <div
          className="event-selector"
          style={{
            display: "flex",
            gap: "1rem",
            justifyContent: "center",
            marginBottom: "1.5rem",
          }}
        >
          {events.map((ev) => (
            <button
              key={ev.EventId}
              onClick={() => setSelectedEventId(ev.EventId)}
              style={{
                padding: "1.2rem 2rem",
                fontSize: "1.5rem",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                backgroundColor:
                  ev.EventId === selectedEventId ? "#2563eb" : "#f3f4f6",
                color: ev.EventId === selectedEventId ? "white" : "black",
                fontWeight: ev.EventId === selectedEventId ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {ev.EventName}
            </button>
          ))}
        </div>
      )}

      {/* Standings Table */}
      {loading ? (
        <div>Loading standings…</div>
      ) : standings.length === 0 ? (
        <div>No standings available for this event.</div>
      ) : (
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            marginTop: "1rem",
          }}
        >
          <thead>
            <tr>
              <th
                style={{ textAlign: "left", padding: "0.5rem", cursor: "pointer" }}
                onClick={() => handleSort("name")}
              >
                Fighter {sortKey === "name" && (sortAsc ? "▲" : "▼")}
              </th>
              <th
                style={{ textAlign: "left", padding: "0.5rem", cursor: "pointer" }}
                onClick={() => handleSort("club")}
              >
                Club {sortKey === "club" && (sortAsc ? "▲" : "▼")}
              </th>
              <th
                style={{ textAlign: "center", padding: "0.5rem", cursor: "pointer" }}
                onClick={() => handleSort("wins")}
              >
                Wins {sortKey === "wins" && (sortAsc ? "▲" : "▼")}
              </th>
              <th
                style={{ textAlign: "center", padding: "0.5rem", cursor: "pointer" }}
                onClick={() => handleSort("losses")}
              >
                Losses {sortKey === "losses" && (sortAsc ? "▲" : "▼")}
              </th>
              <th
                style={{ textAlign: "center", padding: "0.5rem", cursor: "pointer" }}
                onClick={() => handleSort("draws")}
              >
                Draws {sortKey === "draws" && (sortAsc ? "▲" : "▼")}
              </th>
              <th
                style={{ textAlign: "center", padding: "0.5rem", cursor: "pointer" }}
                onClick={() => handleSort("points")}
              >
                Points {sortKey === "points" && (sortAsc ? "▲" : "▼")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedStandings.map((row) => (
              <tr key={row.fighterId} style={{ borderTop: "1px solid #e5e7eb" }}>
                <td style={{ padding: "0.5rem" }}>{row.name}</td>
                <td style={{ padding: "0.5rem" }}>{row.club || "-"}</td>
                <td style={{ textAlign: "center" }}>{row.wins}</td>
                <td style={{ textAlign: "center" }}>{row.losses}</td>
                <td style={{ textAlign: "center" }}>{row.draws}</td>
                <td style={{ textAlign: "center" }}>{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default EventStandings;

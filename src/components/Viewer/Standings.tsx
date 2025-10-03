/**
 * src/components/Viewer/EventStandings.tsx
 *
 * === Public Event Standings Viewer ===
 * Read-only view of tournament standings per event.
 * - TournamentId pulled from URL
 * - Fixed top bar with event selector (matching ScoreManagement style)
 * - Standings table for selected event
 * - Columns order changes to match multi-key ranking buttons
 * - Blank/null clubs sort to the bottom
 * - Adds Rank column (hidden if sorting by fighter/club)
 */

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { backend_uri, tournament_api, event_api } from "../utility/endpoints";
import FloatingNav from "../utility/FloatingNav";
import { apiQuery } from "../utility/apiClient";

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
  avgScorePerExchange: number;
  avgScorePerMatch: number;
}

type SortKey = keyof StandingRow;
type CustomSortMode = "none" | "winsFirst" | "exchangeFirst";

const EventStandings: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>();

  const [tournamentName, setTournamentName] = useState<string>("");
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("wins");
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [customSortMode, setCustomSortMode] = useState<CustomSortMode>("none");

  // ---------- Fetch Tournament ----------
  const fetchTournament = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const resp = await apiQuery(`${backend_uri}/${tournament_api}?id=${tournamentId}`);
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
      const resp = await apiQuery(`${backend_uri}/${event_api}?tournamentId=${tournamentId}`);
      const data = await resp.json();
      if (data.status === "success" && Array.isArray(data.events)) {
        setEvents(data.events);
        setSelectedEventId(null); // leave unselected by default
      } else {
        setEvents([]);
      }
    } catch (err) {
      console.error("Error fetching events:", err);
      setEvents([]);
    }
  }, [tournamentId]);

  // ---------- Fetch Standings ----------
  const fetchStandings = useCallback(
    async (eventId: number) => {
      if (!tournamentId || !eventId) return;
      try {
        setLoading(true);
        const resp = await apiQuery(
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
    setCustomSortMode("none");
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortedStandings = [...standings].sort((a, b) => {
    if (customSortMode === "winsFirst") {
      if (a.wins !== b.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      if (a.avgScorePerExchange !== b.avgScorePerExchange) {
        return b.avgScorePerExchange - a.avgScorePerExchange;
      }
      if (a.avgScorePerMatch !== b.avgScorePerMatch) {
        return b.avgScorePerMatch - a.avgScorePerMatch;
      }
      return a.name.localeCompare(b.name);
    }

    if (customSortMode === "exchangeFirst") {
      if (a.avgScorePerExchange !== b.avgScorePerExchange) {
        return b.avgScorePerExchange - a.avgScorePerExchange;
      }
      if (a.avgScorePerMatch !== b.avgScorePerMatch) {
        return b.avgScorePerMatch - a.avgScorePerMatch;
      }
      if (a.wins !== b.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      return a.name.localeCompare(b.name);
    }

    if (sortKey === "club") {
      const aClub = a.club ? a.club : "zzzzzz";
      const bClub = b.club ? b.club : "zzzzzz";
      return sortAsc ? aClub.localeCompare(bClub) : bClub.localeCompare(aClub);
    }

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

  // ---------- Column Ordering ----------
  const getColumns = () => {
    if (customSortMode === "winsFirst") {
      return ["wins", "losses", "avgScorePerExchange", "avgScorePerMatch", "draws"];
    }
    if (customSortMode === "exchangeFirst") {
      return ["avgScorePerExchange", "avgScorePerMatch", "wins", "losses", "draws"];
    }
    return ["wins", "losses", "draws", "avgScorePerExchange", "avgScorePerMatch"];
  };

  const columns = getColumns();

  // ---------- Rank Column Logic ----------
  const showRank =
    customSortMode !== "none" || (sortKey !== "name" && sortKey !== "club");

  // ---------- Render ----------
  return (
    <div className="App hide-caret">
      <div className="event-selection-buttons" style={{ marginTop: "0" }}>
        {events.map((ev) => (
          <button
            key={ev.EventId}
            onClick={() => setSelectedEventId(ev.EventId)}
            className={selectedEventId === ev.EventId ? "active-event" : ""}
          >
            {ev.EventName}
          </button>
        ))}
      </div>

      <div style={{ margin: "0 auto", padding: "1.5rem", maxWidth: "1100px" }}>
        <h1 style={{ marginBottom: "1rem", textAlign: "center" }}>
          {tournamentName || "Tournament"} – Standings
        </h1>

        {!selectedEventId ? (
          <div style={{ textAlign: "center", marginTop: "2rem", fontSize:"1.5rem", color: "#fff"}}>
            <h3>↑↑↑ Please select an event for {tournamentName || "this tournament"} from above ↑↑↑</h3>
          </div>
        ) : (
          <>
            {/* Ranking buttons only visible when an event is selected */}
            <div style={{ marginBottom: "1rem", textAlign: "center" }}>
              <aside>↓ click these buttons for multi-key ranking, or headings for single-key ranking ↓</aside>
              <button
                onClick={() => {
                  setCustomSortMode("winsFirst");
                  setSortKey("wins");
                  setSortAsc(false);
                }}
                style={{
                  padding: "0.5rem 1rem",
                  marginRight: "0.5rem",
                  backgroundColor: customSortMode === "winsFirst" ? "#2563eb" : "#f3f4f6",
                  color: customSortMode === "winsFirst" ? "#fff" : "#000",
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Ranking: Wins → Losses → Avg/Exchange → Avg/Match → Draws
              </button>
              <button
                onClick={() => {
                  setCustomSortMode("exchangeFirst");
                  setSortKey("avgScorePerExchange");
                  setSortAsc(false);
                }}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: customSortMode === "exchangeFirst" ? "#2563eb" : "#f3f4f6",
                  color: customSortMode === "exchangeFirst" ? "#fff" : "#000",
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Ranking: Avg/Exchange → Avg/Match → Wins → Losses → Draws
              </button>
            </div>

            {loading ? (
              <div>Loading standings…</div>
            ) : standings.length === 0 ? (
              <div>No standings available for this event.</div>
            ) : (
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    {showRank && (
                      <th style={{ textAlign: "center", padding: "0.5rem" }}>#</th>
                    )}
                    <th
                      style={{ textAlign: "left", padding: "0.5rem", cursor: "pointer" }}
                      onClick={() => handleSort("name")}
                    >
                      Fighter{" "}
                      {customSortMode === "none" &&
                        sortKey === "name" &&
                        (sortAsc ? "▲" : "▼")}
                    </th>
                    <th
                      style={{ textAlign: "left", padding: "0.5rem", cursor: "pointer" }}
                      onClick={() => handleSort("club")}
                    >
                      Club{" "}
                      {customSortMode === "none" &&
                        sortKey === "club" &&
                        (sortAsc ? "▲" : "▼")}
                    </th>
                    {columns.map((col) => (
                      <th
                        key={col}
                        style={{
                          textAlign: "center",
                          padding: "0.5rem",
                          cursor: "pointer",
                        }}
                        onClick={() => handleSort(col as SortKey)}
                      >
                        {col === "wins" && "Wins"}
                        {col === "losses" && "Losses"}
                        {col === "draws" && "Draws"}
                        {col === "avgScorePerExchange" && "Avg / Exchange"}
                        {col === "avgScorePerMatch" && "Avg / Match"}
                        {customSortMode === "none" &&
                          sortKey === (col as SortKey) &&
                          (sortAsc ? " ▲" : " ▼")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedStandings.map((row, index) => {
                    let rank: number | null = null;
                    if (showRank) {
                      if (sortAsc) {
                        rank = sortedStandings.length - index;
                      } else {
                        rank = index + 1;
                      }
                    }
                    return (
                      <tr
                        key={row.fighterId}
                        style={{ borderTop: "1px solid #e5e7eb" }}
                      >
                        {showRank && (
                          <td style={{ textAlign: "center" }}>{rank}</td>
                        )}
                        <td style={{ padding: "0.5rem" }}>{row.name}</td>
                        <td style={{ padding: "0.5rem" }}>
                          {row.club || "-"}
                        </td>
                        {columns.map((col) => (
                          <td key={col} style={{ textAlign: "center" }}>
                            {col === "wins" && row.wins}
                            {col === "losses" && row.losses}
                            {col === "draws" && row.draws}
                            {col === "avgScorePerExchange" &&
                              (row.avgScorePerExchange ?? 0).toFixed(2)}
                            {col === "avgScorePerMatch" &&
                              (row.avgScorePerMatch ?? 0).toFixed(2)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {tournamentId && (
        <FloatingNav
          tournamentId={parseInt(tournamentId, 10)}
          backUrl="/"
          links={[
            { text: "Event Scores", to: `/viewer/scores/${tournamentId}` },
            { text: "Event Schedules", to: `/viewer/schedules/${tournamentId}` },
            { text: "Tournament Info", to: `/viewer/tournament/${tournamentId}` }
          ]}
        />
      )}
    </div>
  );
};

export default EventStandings;

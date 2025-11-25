/**
 * src/components/Viewer/Schedules.tsx
 *
 * === Public Tournament Schedules Viewer ===
 * Read-only version of MatchManagement.
 * - TournamentId pulled from URL
 * - Event select bar at top
 * - Automatically loads whichever match format is active for that event
 * - No format switching or editing
 */

import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import MatchFightersManual from "../Manager/matchSubComponents/MatchFightersManual";
import MatchRoundRobinPools from "../Manager/matchSubComponents/roundRobinPools/MatchRoundRobinPools";
import MatchSingleElim from "../Manager/matchSubComponents/singleElim/MatchSingleElim";
import useTournamentFighters from "../Manager/subComponents/useTournamentFighters";
import useEvents from "../Manager/subComponents/useEvents";
import useTournaments from "../Manager/subComponents/useTournaments";
import FloatingNav from "../utility/FloatingNav";
import { RefreshProvider, useRefresh } from "../utility/RefreshContext";
import { backend_uri, event_api } from "../utility/endpoints";
import { safeParseJson, normalizeMatchFormat } from "../utility/dataGuards";
import { apiQuery } from "../utility/apiClient";

type MatchType =
  | "manual"
  | "roundRobinPools"
  | "singleElimination"
  | "doubleElimination";

const Schedules: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const numericTournamentId = tournamentId ? parseInt(tournamentId, 10) : undefined;

  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const [matchType, setMatchType] = useState<MatchType>("manual");

  const { tournaments } = useTournaments();
  const tournament = tournaments.find(
    (t) => Number(t.TournamentId) === numericTournamentId
  );

  const {
    fighters,
    loading: fightersLoading,
    error: fightersError,
    fetchTournamentFighters,
  } = useTournamentFighters(numericTournamentId);

  const { refreshKey } = useRefresh();

  const {
    events,
    loading: eventsLoading,
    error: eventsError,
  } = useEvents(refreshKey, numericTournamentId);

  // pull format when event changes
  useEffect(() => {
    if (!selectedEvent) return;

    const controller = new AbortController();
    const { signal } = controller;

    const fetchFormat = async () => {
      try {
        const url = `${backend_uri}/${event_api}?eventId=${selectedEvent}&format=1`;
        const res = await apiQuery(url, { signal }).catch(() => null);
        if (!res) return;

        const bodyText = await res.text().catch(() => null);
        const data = safeParseJson(bodyText);

        if (res.ok && data?.status === "success") {
          setMatchType(normalizeMatchFormat(String(data.format)));
        } else {
          setMatchType("manual");
        }
      } catch {
        setMatchType("manual");
      }
    };

    fetchFormat();
    return () => controller.abort();
  }, [selectedEvent]);

  // fetch fighters on mount + refresh
  useEffect(() => {
    if (numericTournamentId !== undefined) {
      fetchTournamentFighters();
    }
  }, [numericTournamentId, refreshKey, fetchTournamentFighters]);

  if (!numericTournamentId) return <div>Missing tournament ID</div>;
  if (fightersLoading || eventsLoading) return <div>Loading data…</div>;
  if (fightersError) return <div>Error loading fighters: {fightersError}</div>;
  if (eventsError) return <div>Error loading events: {eventsError}</div>;

  const tournamentEvents = events.filter(
    (e) => e.TournamentId === numericTournamentId
  );
  const selectedEventObj = tournamentEvents.find((e) => e.EventId === selectedEvent);
  const maxRings = selectedEventObj?.MaxRings ?? 1;
  const tournamentName = tournament
    ? tournament.TournamentName
    : `Tournament ${numericTournamentId}`;

  return (
    <div className="App">
      {/* Event selection bar */}
      <div className="select-button-container">
        <div className="event-selection-buttons" style={{ marginTop: "0rem" }}>
          {tournamentEvents.map((event) => (
            <button
              key={event.EventId}
              onClick={() => setSelectedEvent(event.EventId)}
              className={selectedEvent === event.EventId ? "active-event" : ""}
            >
              {event.EventName}
            </button>
          ))}
        </div>
      </div>


      {/* Body */}
      <div style={{ marginTop: "10rem", textAlign: "center", width: "100%" }}>
        {!selectedEventObj ? (
          <h2 style={{ fontSize:"1.5rem" }}>↑↑↑ Please select an event for {tournamentName} from above ↑↑↑</h2>
        ) : (
          <>
            <h1>
              {tournamentName} – {selectedEventObj.EventName} Schedule
            </h1>

            <div style={{ marginTop: "1.5rem" }}>
              {matchType === "manual" && (
                <MatchFightersManual
                  fighters={fighters}
                  eventId={selectedEventObj.EventId}
                  maxRings={maxRings}
                  isActive={true}
                  readOnly={true}
                  tournamentId={numericTournamentId}
                />
              )}

              {matchType === "roundRobinPools" && (
                <MatchRoundRobinPools
                  eventId={selectedEventObj.EventId}
                  eventName={selectedEventObj.EventName}
                  maxRings={maxRings}
                  isActive={true}
                  readOnly={true}
                  tournamentId={numericTournamentId}
                />
              )}

              {matchType === "singleElimination" && (
                <MatchSingleElim
                  eventId={selectedEventObj.EventId}
                  eventName={selectedEventObj.EventName}
                  maxRings={maxRings}
                  isActive={true}
                  tournamentId={numericTournamentId}
                  readOnly={true}
                />
              )}
            </div>
          </>
        )}
      </div>

      <FloatingNav
        tournamentId={numericTournamentId}
        backUrl="/"
        links={[
          { text: "Standings", to: `/viewer/standings/${numericTournamentId}` },
          { text: "Scores", to: `/viewer/scores/${tournamentId}` },
          { text: "Tournament Info", to: `/viewer/tournament/${numericTournamentId}` },
        ]}
      />
    </div>
  );
};

const SchedulesWithProvider: React.FC = () => (
  <RefreshProvider>
    <Schedules />
  </RefreshProvider>
);

export default SchedulesWithProvider;

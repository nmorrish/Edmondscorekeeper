/**
 * src/components/Manager/MatchManagement.tsx
 *
 * === Match Management View ===
 * Dedicated page for matching fighters in a tournament.
 * Accessed from router: /manager/matching/:tournamentId
 */

import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import MatchFightersManual from "./matchSubComponents/MatchFightersManual";
import useTournamentFighters from "./subComponents/useTournamentFighters";
import useEvents from "./subComponents/useEvents";
import useTournaments from "./subComponents/useTournaments";
import FloatingNav from "../utility/FloatingNav";
import { RefreshProvider, useRefresh } from "../utility/RefreshContext";
import MatchRoundRobinPools from "./matchSubComponents/roundRobinPools/MatchRoundRobinPools";
import { backend_uri, event_api } from "../utility/endpoints";

type MatchType =
  | "manual"
  | "roundRobinPools"
  | "singleElimination"
  | "doubleElimination";

const MatchManagement: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const numericTournamentId = tournamentId
    ? parseInt(tournamentId, 10)
    : undefined;

  // Tournament info
  const { tournaments } = useTournaments();
  const tournament = tournaments.find(
    (t) => t.TournamentId === numericTournamentId
  );

  // Fighters
  const {
    fighters,
    loading: fightersLoading,
    error: fightersError,
    fetchTournamentFighters,
  } = useTournamentFighters(numericTournamentId);
  const { refreshKey } = useRefresh();

  // Events
  const { events, loading: eventsLoading, error: eventsError } = useEvents(
    refreshKey,
    numericTournamentId
  );

  // Selected event + match type
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [matchType, setMatchType] = useState<MatchType>("manual"); // truth from API
  const [viewType, setViewType] = useState<MatchType>("manual");   // UI state

  // Fetch format when an event is selected
  useEffect(() => {
    const fetchFormat = async () => {
      if (!selectedEventId) return;

      try {
        const res = await fetch(
          `${backend_uri}/${event_api}?eventId=${selectedEventId}&format=1`
        );
        const data = await res.json();
        if (data.status === "success") {
          const apiFormat = data.format as MatchType;
          setMatchType(apiFormat); // set default for this event
          setViewType(apiFormat);  // also set the current view
        }
      } catch (err) {
        console.error("Error fetching match format", err);
      }
    };

    fetchFormat();
  }, [selectedEventId]);

  // Refetch fighters on refresh
  useEffect(() => {
    fetchTournamentFighters();
  }, [refreshKey, fetchTournamentFighters]);

  // Display tournament name fallback
  const tournamentName = tournament
    ? tournament.TournamentName
    : `Tournament ${tournamentId}`;

  if (fightersLoading || eventsLoading) return <div>Loading data…</div>;
  if (fightersError) return <div>Error loading fighters: {fightersError}</div>;
  if (eventsError) return <div>Error loading events: {eventsError}</div>;

  const selectedEvent = events.find((e) => e.EventId === selectedEventId);

  return (
    <div
      className="App"
      style={{ width: "100%", display: "flex", flexDirection: "column" }}
    >
      {/* Toolbar with events */}
      <div
        className="event-toolbar"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          background: "#222",
          padding: "0.5rem",
          display: "flex",
          justifyContent: "center",
          gap: "0.5rem",
          zIndex: 1000,
        }}
      >
        {events.map((event) => (
          <button
            key={`event-${event.EventId}`}
            onClick={() => setSelectedEventId(event.EventId)}
            style={{
              background: selectedEventId === event.EventId ? "#555" : "#333",
              color: "#fff",
              padding: "0.5rem 1rem",
              border: "1px solid #444",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            {event.EventName}
          </button>
        ))}
      </div>

      {/* Inner wrapper to center content */}
      <div
        style={{
          paddingTop: "3rem",
          width: "100%",
          maxWidth: "1200px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        {!selectedEvent ? (
          <div style={{ marginTop: "2rem" }}>
            <h2>
              Please select an event for {tournamentName} from the toolbar above
            </h2>
          </div>
        ) : (
          <>
            <header className="App-header">
              <h1>
                {tournamentName} - {selectedEvent.EventName} matches
              </h1>
            </header>

            {/* Match type selector */}
            <div
              className="match-type-toolbar"
              style={{
                margin: "1rem 0",
                display: "flex",
                justifyContent: "center",
                gap: "1rem",
              }}
            >
              {(
                [
                  "manual",
                  "roundRobinPools",
                  "singleElimination",
                  "doubleElimination",
                ] as MatchType[]
              ).map((type) => (
                <button
                  key={type}
                  onClick={() => setViewType(type)} // only changes view
                  style={{
                    background: viewType === type ? "#007bff" : "",
                    color: "#fff",
                    padding:
                      viewType === type ? "1rem 1.5rem" : "0.5rem 1rem",
                    fontSize: viewType === type ? "1.2rem" : "1rem",
                    fontWeight: viewType === type ? "bold" : "normal",
                    borderRadius: "6px",
                    transform:
                      viewType === type ? "scale(1.05)" : "scale(1)",
                    transition: "all 0.2s ease-in-out",
                  }}
                >
                  {type === "manual"
                    ? "Manual"
                    : type === "roundRobinPools"
                    ? "Round Robin Pools"
                    : type === "singleElimination"
                    ? "Single Elimination"
                    : "Double Elimination"}
                </button>
              ))}
            </div>

            {/* Matching UI - render based on viewType */}
            <div className="matching-section" style={{ marginTop: "1.5rem" }}>
              {viewType === "manual" && (
                <MatchFightersManual
                  fighters={fighters}
                  eventId={selectedEvent.EventId}
                  maxRings={selectedEvent.MaxRings || 1}
                  isActive={matchType === "manual"} // only true if API says so
                />
              )}

              {viewType === "roundRobinPools" && selectedEvent && (
                <MatchRoundRobinPools
                  eventId={selectedEvent.EventId}
                  eventName={selectedEvent.EventName}
                  maxRings={selectedEvent.MaxRings || 1}
                  isActive={matchType === "roundRobinPools"}
                />
              )}

              {/* Future components: */}
              {/* {viewType === "singleElimination" && (
                <MatchFightersSingleElimination
                  eventId={selectedEvent.EventId}
                  isActive={matchType === "singleElimination"}
                />
              )} */}
              {/* {viewType === "doubleElimination" && (
                <MatchFightersDoubleElimination
                  eventId={selectedEvent.EventId}
                  isActive={matchType === "doubleElimination"}
                />
              )} */}
            </div>
          </>
        )}
      </div>
      {numericTournamentId !== undefined && (
        <FloatingNav
          tournamentId={numericTournamentId}
          backUrl="/manager/tournament"
          links={[
            {
              text: "Scorekeeping",
              to: `/manager/tournament/${numericTournamentId}`,
            },
            {
              text: "Edit Fighters",
              to: `/manager/fighters/${numericTournamentId}`,
            },
          ]}
        />
      )}
    </div>
  );
};

// Wrap in RefreshProvider
const MatchManagementWithProvider: React.FC = () => (
  <RefreshProvider>
    <MatchManagement />
  </RefreshProvider>
);

export default MatchManagementWithProvider;

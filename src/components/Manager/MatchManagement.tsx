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
import { RefreshProvider, useRefresh } from "../utility/RefreshContext";

type MatchType = "manual" | "roundRobinPools" | "singleElim" | "doubleElim";

const MatchManagement: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const numericTournamentId = tournamentId ? parseInt(tournamentId, 10) : undefined;

  // Tournament info
  const { tournaments } = useTournaments();
  const tournament = tournaments.find(t => t.TournamentId === numericTournamentId);

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
  const [matchType, setMatchType] = useState<MatchType>("manual");

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

  const selectedEvent = events.find(e => e.EventId === selectedEventId);

  return (
    <div className="App" style={{ width: "100%", display: "flex", flexDirection: "column" }}>
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
        {events.map(event => (
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
                {tournamentName} - {selectedEvent.EventName}
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
              <button onClick={() => setMatchType("manual")}>Manual</button>
              <button onClick={() => setMatchType("roundRobinPools")}>Round Robin Pools</button>
              <button onClick={() => setMatchType("singleElim")}>Single Elim</button>
              <button onClick={() => setMatchType("doubleElim")}>Double Elim</button>
            </div>

            {/* Matching UI - render based on matchType */}
            <div className="matching-section" style={{ marginTop: "1.5rem" }}>
              {matchType === "manual" && (
                <MatchFightersManual
                  fighters={fighters}
                  eventId={selectedEvent.EventId}
                  maxRings={selectedEvent.MaxRings || 1}
                />
              )}

              {/* Future components: */}
              {/* {matchType === "roundRobinPools" && <MatchFightersRoundRobinPools ... />} */}
              {/* {matchType === "singleElim" && <MatchFightersSingleElim ... />} */}
              {/* {matchType === "doubleElim" && <MatchFightersDoubleElim ... />} */}
            </div>
          </>
        )}
      </div>
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

/**
 * src/components/Viewer/Scores.tsx
 *
 * === Public Scores Viewer ===
 * Read-only display of MatchTables for a given Tournament + Event.
 * - TournamentId pulled from URL
 * - Event selector + ring selector at top
 * - Omits fighter list (unlike ScoreManagement)
 */

import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import MatchTables from "../Manager/scoreSubComponents/MatchTables";
import useFighters from "../Manager/subComponents/useFighters";
import useEvents from "../Manager/subComponents/useEvents";
import useTournaments from "../Manager/subComponents/useTournaments"; 
import FloatingNav from "../utility/FloatingNav";
import { Fighter } from "../Manager/subComponents/useFighters";
import { RefreshProvider } from "../utility/RefreshContext";

const Scores: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const numericTournamentId = tournamentId ? parseInt(tournamentId, 10) : undefined;

  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const [selectedRing, setSelectedRing] = useState<number | null>(null);

  const { fighters: fetchedFighters, fetchFighterData } = useFighters();
  const { events, loading, error } = useEvents(undefined, numericTournamentId);
  const { tournaments } = useTournaments(); // fetch tournaments

  const [fighters, setFighters] = useState<Fighter[]>([]);

  useEffect(() => {
    setFighters(fetchedFighters);
  }, [fetchedFighters]);

  useEffect(() => {
    if (numericTournamentId !== undefined) {
      fetchFighterData(numericTournamentId);
    }
  }, [numericTournamentId, fetchFighterData]);

  if (!numericTournamentId) return <div>Missing tournament ID</div>;
  if (loading) return <div>Loading events...</div>;
  if (error) return <div>Error: {error}</div>;

  const tournamentEvents = events.filter((e) => e.TournamentId === numericTournamentId);
  const selectedEventObj = tournamentEvents.find((e) => e.EventId === selectedEvent);
  const maxRings = selectedEventObj?.MaxRings ?? 0;

  // derive tournament name
  const tournamentObj = tournaments.find((t) => t.TournamentId === numericTournamentId);
  const tournamentName = tournamentObj?.TournamentName ?? "Tournament";

  return (
    <div className="App">
      <div className="select-button-container">
        {/* Event selection bar */}
        <div className="event-selection-buttons">
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

        {/* Ring selection */}
        {selectedEvent && maxRings > 0 && (
          <div className="ring-selection-buttons">
            {Array.from({ length: maxRings }, (_, i) => i + 1).map((ring) => (
              <button
                key={ring}
                onClick={() => setSelectedRing(ring)}
                className={selectedRing === ring ? "active-ring" : ""}
              >
                Ring {ring}
              </button>
            ))}
          </div>
        )}
      </div>


      <main
        className="score-main"
        style={{ marginTop: "11rem", width: "100%", textAlign: "center" }}
      >
        {!(selectedEvent && selectedRing) ? (
          <div className="score-placeholder">
            <h2 style={{ fontSize: "1.5rem", textAlign: "center" }}>
              ↑↑↑ Please select an event for {tournamentName} from above ↑↑↑
            </h2>
          </div>
        ) : (
          <>
            <h2 style={{ marginTop: "11rem", width: "100%", textAlign: "center" }}>Score Details</h2>
            <MatchTables
              eventId={selectedEvent}
              ringNumber={selectedRing}
              tournamentId={numericTournamentId}
              fighters={fighters}
              maxRings={maxRings}
              onStrikeUpdate={() => {}}
              readOnly={true}
            />
          </>
          
        )}
      </main>

      <FloatingNav
        tournamentId={numericTournamentId}
        backUrl="/"
        links={[
          { text: "Standings", to: `/viewer/standings/${tournamentId}` },
          { text: "Event Schedules", to: `/viewer/schedules/${tournamentId}` },
          { text: "Tournament Info", to: `/viewer/tournament/${tournamentId}` },
        ]}
      />
    </div>
  );
};

const ScoreViewerWithProvider: React.FC = () => (
  <RefreshProvider>
    <Scores />
  </RefreshProvider>
);

export default ScoreViewerWithProvider;
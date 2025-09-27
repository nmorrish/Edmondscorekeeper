/**
 * src/components/Manager/ScoreManagement.tsx
 *
 * === Score Table Management Interface ===
 */
import React, { useState, useEffect } from "react";
import FighterList from "./fighterSubComponents/FighterList";
import MatchTables from "./scoreSubComponents/MatchTables";
import { RefreshProvider } from "../utility/RefreshContext";
import useFighters from "./subComponents/useFighters";
import useEvents from "./subComponents/useEvents";
import { Fighter } from "./subComponents/useFighters";

const ScoreManagement: React.FC = () => {
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const [selectedRing, setSelectedRing] = useState<number | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<number | null>(null);

  const { fighters: fetchedFighters, fetchFighterData } = useFighters();
  const { events, loading, error } = useEvents();

  const [fighters, setFighters] = useState<Fighter[]>([]);

  useEffect(() => {
    setFighters(fetchedFighters);
  }, [fetchedFighters]);

  const handleEventSelection = (eventId: number, tournamentId: number) => {
    setSelectedEvent(eventId);
    setSelectedTournament(tournamentId);
    setSelectedRing(null);
    fetchFighterData(tournamentId);
  };

  const handleRingSelection = (ringNumber: number) => {
    setSelectedRing(ringNumber);
  };

  const handleStrikeUpdate = (fighterId: number, newStrikes: number) => {
    setFighters((prev) =>
      prev.map((f) =>
        f.FighterId === fighterId ? { ...f, Strikes: newStrikes } : f
      )
    );
  };

  if (loading) return <div>Loading events...</div>;
  if (error) return <div>Error: {error}</div>;

  // find the selected event object
  const selectedEventObj = events.find((e) => e.EventId === selectedEvent);
  const maxRings = selectedEventObj?.MaxRings ?? 0;

  return (
    <div className="App">
      {/* Event selection bar */}
      <div className="event-selection-buttons">
        {events.map((event) => (
          <button
            key={event.EventId}
            onClick={() => handleEventSelection(event.EventId, event.TournamentId)}
            className={selectedEvent === event.EventId ? "active-event" : ""}
          >
            {event.EventName}
          </button>
        ))}
      </div>

      {/* Dynamic ring selection based on MaxRings */}
      {selectedEvent && maxRings > 0 && (
        <div className="ring-selection-buttons">
          {Array.from({ length: maxRings }, (_, i) => i + 1).map((ring) => (
            <button
              key={ring}
              onClick={() => handleRingSelection(ring)}
              className={selectedRing === ring ? "active-ring" : ""}
            >
              Ring {ring}
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: "110px" }} className="score-layout">
        {selectedEvent && (
          <aside className="score-sidebar">
            <FighterList fighters={fighters} eventId={selectedEvent} />
          </aside>
        )}

        <main className="score-main">
          {!(selectedEvent && selectedRing && selectedTournament) ? (
            <div className="score-placeholder">
              <strong>Select Event, Tournament, and Ring No. above</strong>
            </div>
          ) : (
            <MatchTables
              eventId={selectedEvent}
              ringNumber={selectedRing}
              tournamentId={selectedTournament}
              fighters={fighters}
              onStrikeUpdate={handleStrikeUpdate}
            />
          )}
        </main>
      </div>
    </div>
  );
};

const ScoreManagementWithProvider: React.FC = () => (
  <RefreshProvider>
    <ScoreManagement />
  </RefreshProvider>
);

export default ScoreManagementWithProvider;

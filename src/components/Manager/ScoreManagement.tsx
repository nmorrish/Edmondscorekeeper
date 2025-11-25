/**
 * src/components/Manager/ScoreManagement.tsx
 *
 * === Score Table Management Interface ===
 */
import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import TournamentFighterList from "./fighterSubComponents/TournamentFighterList";
import MatchTables from "./scoreSubComponents/MatchTables";
import { RefreshProvider } from "../utility/RefreshContext";
import useFighters from "./subComponents/useFighters";
import useEvents from "./subComponents/useEvents";
import FloatingNav from "../utility/FloatingNav";
import { Fighter } from "./subComponents/useFighters";

const ScoreManagement: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const numericTournamentId = tournamentId ? parseInt(tournamentId, 10) : undefined;

  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const [selectedRing, setSelectedRing] = useState<number | null>(null);

  const { fighters: fetchedFighters, fetchFighterData } = useFighters();
  const { events, loading, error } = useEvents(undefined, numericTournamentId);

  const [fighters, setFighters] = useState<Fighter[]>([]);

  const [showFighterList, setShowFighterList] = useState<boolean>(false);

  useEffect(() => {
    setFighters(fetchedFighters);
  }, [fetchedFighters]);

  // fetch fighters immediately once tournamentId is known
  useEffect(() => {
    if (numericTournamentId !== undefined) {
      fetchFighterData(numericTournamentId);
    }
  }, [numericTournamentId, fetchFighterData]);

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

  if (!numericTournamentId) return <div>Missing tournament ID</div>;
  if (loading) return <div>Loading events...</div>;
  if (error) return <div>Error: {error}</div>;

  // always tied to this tournament
  const tournamentEvents = events.filter((e) => e.TournamentId === numericTournamentId);
  const selectedEventObj = tournamentEvents.find((e) => e.EventId === selectedEvent);
  const maxRings = selectedEventObj?.MaxRings ?? 0;

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

        {/* Ring selection for chosen event */}
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

      </div>


      <div style={{ marginTop: "110px" }} className="score-layout">

        {/* fighter sidebar appears only when toggled */}
        {selectedEvent && showFighterList && (
          <aside className="score-sidebar">
            <TournamentFighterList fighters={fighters} eventId={numericTournamentId} />
          </aside>
        )}

        <main className="score-main">
          {!(selectedEvent && selectedRing) ? (
            <div className="score-placeholder">
              <strong>Select Event and Ring No. above</strong>
            </div>
          ) : (
          <>
            {/* Fighter toggle */}
            {selectedEvent && (
              <div className="fighter-toggle-container">
                <button
                  onClick={() => setShowFighterList((prev) => !prev)}
                  style={{ marginTop: "10rem", marginBottom: "1rem", padding: "0.3rem 0.8rem"}}
                >
                  {showFighterList ? "Hide Fighter Strike list" : "Show Fighters Strike List"}
                </button>
              </div>
            )}
            <MatchTables
              eventId={selectedEvent}
              ringNumber={selectedRing}
              tournamentId={numericTournamentId}
              fighters={fighters}
              maxRings={maxRings}
              onStrikeUpdate={handleStrikeUpdate}
              readOnly={false}
            />
          </>
          )}
        </main>

      </div>

      <FloatingNav
        tournamentId={numericTournamentId}
        backUrl="/manager/tournament"
        links={[
          { text: "Edit Fighters", to: `/manager/fighters/${numericTournamentId}` },
          { text: "Edit Matches", to: `/manager/matching/${numericTournamentId}` },
        ]}
      />

    </div>
  );
};

const ScoreManagementWithProvider: React.FC = () => (
  <RefreshProvider>
    <ScoreManagement />
  </RefreshProvider>
);

export default ScoreManagementWithProvider;

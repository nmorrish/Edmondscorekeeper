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
import { Fighter } from "./subComponents/useFighters";
import SelectionNavbar from "../utility/SelectionNavbar";

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

      <SelectionNavbar
        events={tournamentEvents.map(e => ({
          EventId: e.EventId,
          EventName: e.EventName,
          MaxRings: e.MaxRings,
        }))}
        selectedEvent={selectedEvent}
        selectedRing={selectedRing}
        onEventSelect={setSelectedEvent}
        onRingSelect={setSelectedRing}
        tournamentId={numericTournamentId}
        backUrl="/manager/tournament"
        navLinks={[
          { text: "Edit Fighters", to: `/manager/fighters/${numericTournamentId}` },
          { text: "Edit Matches", to: `/manager/matching/${numericTournamentId}` },
        ]}
      />


      <div className="score-layout">

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

    </div>
  );
};

const ScoreManagementWithProvider: React.FC = () => (
  <RefreshProvider>
    <ScoreManagement />
  </RefreshProvider>
);

export default ScoreManagementWithProvider;

/**
 * src/components/Manager/FighterManagement.tsx
 * 
 * === Score Table Management Interface ===
 * This is the parent component for all control panel panes used by folks at the score table.
 * 
 * All together, it shows:
 * -how much time remains in a match.
 * -all fighters taking place`in the tournament.
 * -all events and rings in the tournament.
 * -all fighters present in each event ring.
 * -the scores of each fighter for each bout.
 * -strikes accrued by each fighter. 
 * -which matches are currently active, pending, and concluded.
 * 
 * It allows:
 * -adding new fighters to tournament.
 * -matching fighters in a ring for each event.
 * -sending the signal for judges to pass Judgement for their ring.
 * -resending the signal to pass Judgement.
 * -swap around fighters with another fighter in a ring.
 * -assigning strikes to fighters.
 * -setting matches to active/concluded (this also is handled automatically)
 * 
 * The button for sending the Judgement signal performs a hybrid role with the timer. 
 *  -It shows time remaining; the time starts ticking down after hitting 'Start'.
 *  -When the score keeper hits 'Stop', the signal requesting Judgement is sent and 
 *   the timer is stopped until 'Start' is clicked again.
 * 
 * Score should update automatically.
 * 
 * Each exchange in a match is tracked separately so that the score for the bout can 
 * be averaged across all judges that submitted.
 * 
 * Resending the Judgement request is for when a judge did not receive the Judgement signal.
 * Tracking of judge name allows Judgement duplicates to be ignored.
 * Judges should re-submit to be ready for next round.
 * 
 * implements useState, useEffect, and useCallback for optimized state and lifecycle management
 */
import React, { useState, useEffect, useCallback } from "react";
import FighterEntryForm from "./subComponents/FighterEntryForm";
import FighterList from "./subComponents/FighterList";
import MatchFighters from "./subComponents/MatchFighters";
import MatchTables from "./subComponents/MatchTables";
import { RefreshProvider, useRefresh } from "../utility/RefreshContext"; // Import useRefresh
import useFighterData from "./subComponents/useFighterData";
import useEvents from "./subComponents/useEvents"; // Import the useEvents hook

const FighterManagement: React.FC = () => {
  const [activeSidebarComponent, setActiveSidebarComponent] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null); // State for selected event
  const [selectedRing, setSelectedRing] = useState<number | null>(null); // State for selected ring
  const { fighters, fetchFighterData } = useFighterData();
  const { refreshKey } = useRefresh(); // Use refresh context
  const { events, loading, error } = useEvents(); // Fetch events from the useEvents hook

  // Trigger data fetch when refreshKey changes. triggered when the refresh() method is called.
  useEffect(() => {
    console.log("Refresh triggered, fetching updated fighter data");
    fetchFighterData();
  }, [refreshKey, fetchFighterData]);

  const toggleSidebar = useCallback((componentName: string) => {
    setActiveSidebarComponent(prev => (prev === componentName ? null : componentName));
  }, []);

  // Handler to update selected event
  const handleEventSelection = (eventId: number) => {
    setSelectedEvent(eventId);
    setSelectedRing(null); // Reset ring selection when a new event is selected
  };

  // Handler to update selected ring
  const handleRingSelection = (ringNumber: number) => {
    setSelectedRing(ringNumber);
  };

  if (loading) return <div>Loading events...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="App">
      {/* Event selection buttons - fixed at the very top */}
      <div className="event-selection-buttons">
        {events.map(event => (
          <button
            key={event.eventId}
            onClick={() => handleEventSelection(event.eventId)}
            className={selectedEvent === event.eventId ? "active-event" : ""}
          >
            {event.eventName}
          </button>
        ))}
      </div>

      {/* Ring selection buttons, fixed below event buttons */}
      {selectedEvent && (
        <div className="ring-selection-buttons">
          {[1, 2].map(ring => (
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

      {/* Sidebar controls for adding and matching fighters. */}
      <header className="App-header">
        <button onClick={() => toggleSidebar("FighterEntryForm")}>
          {activeSidebarComponent === "FighterEntryForm" ? "Stop Adding Fighters" : "Add Fighters"}
        </button>
        <button onClick={() => toggleSidebar("MatchFighters")}>
          {activeSidebarComponent === "MatchFighters" ? "Stop Matching Fighters" : "Match Fighters"}
        </button>

        {activeSidebarComponent === "FighterEntryForm" && (
          <div className="sidebar">
            <FighterEntryForm onFightersAdded={fetchFighterData} />
          </div>
        )}
        {activeSidebarComponent === "MatchFighters" && (
          <div className="sidebar">
            <MatchFighters fighters={fighters} />
          </div>
        )}

        {/* Display of all fighters */}
        <FighterList fighters={fighters} />
      </header>

      <main>
        {/* Only render MatchTables if both an event and ring are selected */}
        {selectedEvent && selectedRing && (
          <MatchTables eventId={selectedEvent} ringNumber={selectedRing} />
        )}
      </main>
    </div>
  );
};

// Wrap the FighterManagement component with RefreshProvider to ensure the refresh context is available
const FighterManagementWithProvider: React.FC = () => (
  <RefreshProvider>
    <FighterManagement />
  </RefreshProvider>
);

export default FighterManagementWithProvider;

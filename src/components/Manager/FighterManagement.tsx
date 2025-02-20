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

  // Trigger data fetch when refreshKey changes
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

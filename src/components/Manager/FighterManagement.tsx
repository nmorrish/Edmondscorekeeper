import React, { useState, useEffect, useCallback } from "react";
import FighterEntryForm from "./subComponents/FighterEntryForm";
import FighterList from "./subComponents/FighterList";
import MatchFighters from "./subComponents/MatchFighters";
import MatchTables from "./subComponents/MatchTables";
import { RefreshProvider, useRefresh } from "../utility/RefreshContext"; // Import useRefresh
import useFighterData from "./subComponents/useFighterData";

const FighterManagement: React.FC = () => {
  const [activeSidebarComponent, setActiveSidebarComponent] = useState<string | null>(null);
  const [selectedRing, setSelectedRing] = useState<number>(1); // State to track selected ring
  const { fighters, fetchFighterData } = useFighterData(); // Get fighter data
  const { refreshKey } = useRefresh(); // Use refresh context

  // Trigger data fetch when refreshKey changes
  useEffect(() => {
    console.log("Refresh triggered, fetching updated fighter data");
    fetchFighterData(); // Fetch data when refresh is triggered
  }, [refreshKey, fetchFighterData]); // Ensure it's called when refreshKey changes

  const toggleSidebar = useCallback((componentName: string) => {
    setActiveSidebarComponent(prev => (prev === componentName ? null : componentName));
  }, []);

  // Handler to update selected ring
  const handleRingSelection = (ringNumber: number) => {
    setSelectedRing(ringNumber);
  };

  return (
    <div className="App">
      {/* Buttons for selecting the ring - placed outside of header for better layout control */}
      <div className="ring-selection-buttons">
        {/* {[1, 2, 3, 4, 5, 6].map(ring => (
          <button
            key={ring}
            onClick={() => handleRingSelection(ring)}
            className={selectedRing === ring ? "active-ring" : ""}
          >
            Ring {ring}
          </button>
        ))} */}
        {/* Matches are hardcoded for now */}
        <button key={1} onClick={() => handleRingSelection(1)} className={selectedRing === 1 ? "active-ring" : ""}>Open Longsword Ring 1</button>
        <button key={2} onClick={() => handleRingSelection(2)} className={selectedRing === 2 ? "active-ring" : ""}>Open Longsword Ring 2</button>
        <button key={3} onClick={() => handleRingSelection(3)} className={selectedRing === 3 ? "active-ring" : ""}>Women's Longsword</button>
        <button key={4} onClick={() => handleRingSelection(4)} className={selectedRing === 4 ? "active-ring" : ""}>Basket Hilt Ring 1</button>
        <button key={5} onClick={() => handleRingSelection(5)} className={selectedRing === 5 ? "active-ring" : ""}>Basket Hilt Ring 2</button>
        <button key={6} onClick={() => handleRingSelection(6)} className={selectedRing === 6 ? "active-ring" : ""}>Mixed Weapons Ring 1</button>
        <button key={7} onClick={() => handleRingSelection(7)} className={selectedRing === 7 ? "active-ring" : ""}>Mixed Weapons Ring 2</button>
      </div>

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
        {/* Only render MatchTables for the selected ring */}
        <MatchTables ringNumber={selectedRing} />
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

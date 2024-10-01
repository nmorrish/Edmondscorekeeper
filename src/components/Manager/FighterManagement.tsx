import React, { useState, useEffect, useCallback } from "react";
import FighterEntryForm from "./subComponents/FighterEntryForm";
import FighterList from "./subComponents/FighterList";
import MatchFighters from "./subComponents/MatchFighters";
import MatchTables from "./subComponents/MatchTables";
import { RefreshProvider, useRefresh } from "../utility/RefreshContext"; // Import useRefresh
import useFighterData from "./subComponents/useFighterData";

const FighterManagement: React.FC = () => {
  const [activeSidebarComponent, setActiveSidebarComponent] = useState<string | null>(null);
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

  return (
    <div className="App">
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
        <MatchTables />
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

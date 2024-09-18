// src/components/FighterManagementPage.tsx
import React, { useState, useCallback, memo } from "react";
import FighterEntryForm from "./subComponents/FighterEntryForm";
import FighterList from "./subComponents/FighterList";
import MatchFighters from "./subComponents/MatchFighters";
import MatchTables from "./subComponents/MatchTables";
import { RefreshProvider } from "../utility/RefreshContext";
import useFighterData from "./subComponents/useFighterData";

// Memoizing FighterList and MatchFighters to prevent unnecessary re-renders
const MemoizedFighterList = memo(FighterList);
const MemoizedMatchFighters = memo(MatchFighters);

const FighterManagement: React.FC = () => {
  const [activeSidebarComponent, setActiveSidebarComponent] = useState<string | null>(null);
  const { fighters = [], fetchFighterData } = useFighterData();

  // Memoize the toggleSidebar function to avoid re-creating it on every render
  const toggleSidebar = useCallback((componentName: string) => {
    setActiveSidebarComponent(prev => (prev === componentName ? null : componentName));
  }, []);

  return (
    <RefreshProvider>
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
              <MemoizedMatchFighters fighters={fighters} />
            </div>
          )}
          <MemoizedFighterList fighters={fighters} />
        </header>
        <main>
          <MatchTables />
        </main>
      </div>
    </RefreshProvider>
  );
};

export default FighterManagement;

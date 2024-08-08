// src/components/FighterManagementPage.tsx
import React, { useState } from "react";
import FighterEntryForm from "./Manager/FighterEntryForm";
import FighterList from "./Manager/FighterList";
import MatchFighters from "./Manager/MatchFighters";
import MatchTables from "./Manager/MatchTables";
import { RefreshProvider } from "./RefreshContext";
import useFighterData from "./hooks/useFighterData";

const FighterManagement: React.FC = () => {
  const [activeSidebarComponent, setActiveSidebarComponent] = useState<string | null>(null);
  const { fighters, fetchFighterData } = useFighterData();

  const toggleSidebar = (componentName: string) => {
    if (activeSidebarComponent === componentName) {
      setActiveSidebarComponent(null);
    } else {
      setActiveSidebarComponent(componentName);
    }
  };

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
              <MatchFighters fighters={fighters} />
            </div>
          )}
          <FighterList fighters={fighters} />
        </header>
        <main>
          <MatchTables />
        </main>
      </div>
    </RefreshProvider>
  );
};

export default FighterManagement;

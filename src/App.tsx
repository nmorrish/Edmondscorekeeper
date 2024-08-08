// App.tsx
import React, { useState } from "react";
import "./App.css";
import FighterEntryForm from "./components/FighterEntryForm";
import FighterList from "./components/FighterList";
import MatchFighters from "./components/MatchFighters";
import MatchTables from "./components/MatchTables";
import { RefreshProvider } from "./components/RefreshContext";
import useFighterData from "./components/hooks/useFighterData";

const App: React.FC = () => {
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

export default App;

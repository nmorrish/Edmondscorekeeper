/**
 * src/App.tsx
 * 
 * == React App File ==
 * 
 * React Routing implemented here. This is where you want to go to ad more views/pages
 * 
 */
import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import "./App.css";
import ScoreManagementWithProvider from "./components/Manager/ScoreManagement"; 
import JudgementManager from "./components/Judgement/JudgementManager";
import TournamentManagementWithProvider from "./components/Manager/TournamentManagement";
import FighterManagementWithProvider from "./components/Manager/FighterManagement";
import MatchManagementWithProvider from "./components/Manager/MatchManagement";
import EventStandings from './components/Viewer/Standings';
import SchedulesWithProvider from './components/Viewer/Schedules';
import ScoreViewerWithProvider from './components/Viewer/Scores';
import Tournament from './components/Viewer/Tournament';
import TournamentListWithProvider from './components/Viewer/TournamentList';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/judgement/:ringNumber" element={<JudgementManager />} />
        <Route path="/manager/" element={<TournamentManagementWithProvider />} />
        <Route path="/manager/tournament/" element={<TournamentManagementWithProvider />} />
        <Route path="/manager/tournament/:tournamentId" element={<ScoreManagementWithProvider />} />
        <Route path="/manager/fighters/:tournamentId" element={<FighterManagementWithProvider />} />
        <Route path="/manager/matching/:tournamentId" element={<MatchManagementWithProvider />} />
        <Route path="/viewer/standings/:tournamentId" element={<EventStandings />} />
        <Route path="/viewer/schedules/:tournamentId" element={<SchedulesWithProvider />} />
        <Route path="/viewer/scores/:tournamentId" element={<ScoreViewerWithProvider />} />
        <Route path="/viewer/tournament/:tournamentId" element={<Tournament />} />
        <Route path="/" element={<TournamentListWithProvider />} />
      </Routes>
    </Router>
  );
};

export default App;
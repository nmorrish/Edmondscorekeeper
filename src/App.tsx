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

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/judgement/:ringNumber" element={<JudgementManager />} />
        <Route path="/manager/tournament/" element={<TournamentManagementWithProvider />} />
        <Route path="/manager/tournament/:tournamentId" element={<ScoreManagementWithProvider />} />
        <Route path="/manager/fighters/:tournamentId" element={<FighterManagementWithProvider />} />
        <Route path="/manager/matching/:tournamentId" element={<MatchManagementWithProvider />} />
        <Route path="/viewer/standings/:tournamentId" element={<ScoreManagementWithProvider />} />
        <Route path="/viewer/match-schedule/:tournamentId" element={<ScoreManagementWithProvider />} />
        <Route path="/viewer/match-scores/:tournamentId" element={<ScoreManagementWithProvider />} />
        <Route path="/" element={<ScoreManagementWithProvider />} />
      </Routes>
    </Router>
  );
};

export default App;
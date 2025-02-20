import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import "./App.css";
import FighterManagementWithProvider from "./components/Manager/FighterManagement"; // Use the version wrapped with RefreshProvider
import JudgementManager from "./components/Judgement/JudgementManager";

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/judgement/:ringNumber" element={<JudgementManager />} />
        <Route path="/manager" element={<FighterManagementWithProvider />} />
        <Route path="/" element={<FighterManagementWithProvider />} />
      </Routes>
    </Router>
  );
};

export default App;

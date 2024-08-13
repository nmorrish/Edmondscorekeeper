import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import "./App.css";
import FighterManagement from "./components/Manager/FighterManagement";
import JudgementManager from "./components/Judgement/JudgementManager";

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/judgement/:ringNumber" element={<JudgementManager />} />
        <Route path="/manager" element={<FighterManagement />} />
        <Route path="/" element={<FighterManagement />} />
      </Routes>
    </Router>
  );
};

export default App;

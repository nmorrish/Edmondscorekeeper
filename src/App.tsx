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
import FighterManagementWithProvider from "./components/Manager/FighterManagement"; 
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

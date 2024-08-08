// src/App.tsx

import React, { useState, useEffect } from 'react';
import "./App.css";
import FighterManagement from "./components/FighterManagement";
import JudgementManager from "./components/JudgementManager"

const App: React.FC = () => {

  const [route, setRoute] = useState(window.location.pathname);

  useEffect(() => {
    const onLocationChange = () => {
      setRoute(window.location.pathname);
    };

    window.addEventListener('popstate', onLocationChange);

    return () => {
      window.removeEventListener('popstate', onLocationChange);
    };
  }, []);

  const renderPage = () => {
    const [baseRoute, param] = route.split('/').filter(Boolean);

    switch (baseRoute) {
      case '':
        // This would be a good place for putting a public view for the audience watching the tournament scores. Same for the default.
        return null;
      case 'manager':
        return <FighterManagement />;
      case 'judgement':
        return <JudgementManager ringNumber={param} />;
      default:
        return null;
    }
  };

  return (
    <div>
      {renderPage()}
    </div>
  );
  
};

export default App;

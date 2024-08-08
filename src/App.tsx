// src/App.tsx

import React, { useState, useEffect } from 'react';
import "./App.css";
import FighterManagement from "./components/FighterManagement";

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
    switch (route) {
      case '/':
        return <FighterManagement />;
      case '/manager':
        return <FighterManagement />;
      case '/judgement':
        return null;
      default:
        return <FighterManagement />;
    }
  };

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setRoute(path);
  };

  return (
    <div>
      {/* <Navigation navigateTo={navigateTo} /> */}
      {renderPage()}
    </div>
  );
  
};

export default App;

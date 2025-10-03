/**
 * src/components/Viewer/TournamentList.tsx
 *
 * === Tournament List (Viewer) ===
 * Displays all tournaments in a list.
 * Clicking a tournament navigates to its viewer page.
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import useTournaments, { Tournament } from "../Manager/subComponents/useTournaments";
import { RefreshProvider } from "../utility/RefreshContext";

const TournamentList: React.FC = () => {
  const navigate = useNavigate();
  const { tournaments, loading, error } = useTournaments(0);

  if (loading) return <div>Loading tournaments...</div>;
  if (error) return <div>Error loading tournaments: {error}</div>;

  return (
    <div className="tournament-management">
      <h2>Click Tournament to View</h2>
      <div className="tournament-list">
        {tournaments.map((t: Tournament) => (
          <div
            key={t.TournamentId}
            className="tournament-item"
            onClick={() => navigate(`/viewer/tournament/${t.TournamentId}`)}
            style={{ cursor: "pointer" }}
          >
            <span className="tournament-label">
              <strong>{t.TournamentName}</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Wrap with RefreshProvider so it works with hooks
const TournamentListWithProvider: React.FC = () => (
  <RefreshProvider>
    <TournamentList />
  </RefreshProvider>
);

export default TournamentListWithProvider;

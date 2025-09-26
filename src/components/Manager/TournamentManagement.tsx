import React, { useState } from "react";
import TournamentForm from "./tournamentSubComponents/TournamentForm";
import WeaponForm from "./tournamentSubComponents/WeaponForm";
import useTournaments, { Tournament } from "./subComponents/useTournaments";
import useWeapons, { Weapon } from "./tournamentSubComponents/useWeapons";
import { RefreshProvider } from "../utility/RefreshContext";
import useEvents from "./tournamentSubComponents/useEvent";

const TournamentManagement: React.FC = () => {
  // --- tournaments ---
  const [refreshTournaments, setRefreshTournaments] = useState(0);
  const { tournaments, loading: tLoading, error: tError } = useTournaments(refreshTournaments);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null | "new">(null);

  // --- weapons ---
  const [refreshWeapons, setRefreshWeapons] = useState(0);
  const { weapons, loading: wLoading, error: wError } = useWeapons(refreshWeapons);
  const [selectedWeapon, setSelectedWeapon] = useState<Weapon | null | "new">(null);

  // --- handlers ---
  const handleTournamentSaved = () => {
    setRefreshTournaments((f) => f + 1);
    setRefreshEvents((f) => f + 1);   // refresh events too
  };


  const handleWeaponSaved = () => {
    setRefreshWeapons((f) => f + 1);
    setRefreshEvents((f) => f + 1);
  };

  // --- events ---
  const [refreshEvents, setRefreshEvents] = useState(0);
  const { events } = useEvents(refreshEvents);


  if (tLoading || wLoading) return <div>Loading...</div>;
  if (tError) return <div>Error loading tournaments: {tError}</div>;
  if (wError) return <div>Error loading weapons: {wError}</div>;

  return (
    <div className="tournament-management">
      {/* Show tournament form if selected */}
      {selectedTournament !== null ? (
        <TournamentForm
          tournament={selectedTournament === "new" ? null : selectedTournament}
          onClose={() => setSelectedTournament(null)}
          onSaved={handleTournamentSaved}
        />
      ) : selectedWeapon !== null ? (
        <WeaponForm
          weapon={selectedWeapon === "new" ? null : selectedWeapon}
          onClose={() => setSelectedWeapon(null)}
          onSaved={handleWeaponSaved}
        />
      ) : (
        <>
          {/* Tournaments */}
          <h2>Tournaments</h2>
          <div className="tournament-list">
            {tournaments.map((t) => {
              const tEvents = events.filter((e) => e.tournamentId === t.TournamentId);
              const eventNames = tEvents.map((e) => e.name).join(", ");

              return (
                <div key={t.TournamentId} className="tournament-item">
                  <span className="tournament-label">
                    <strong>{t.TournamentName}</strong>
                    {eventNames && `: ${eventNames}`}
                  </span>
                  <div className="tournament-actions">
                    <button
                      onClick={() => setSelectedTournament(t)}
                      className="tournament-button"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() =>
                        (window.location.href = `/manager/tournament/${t.TournamentId}`)
                      }
                      className="tournament-button run-button"
                    >
                      Run Tournament
                    </button>
                  </div>
                </div>
              );
            })}

            <button
              onClick={() => setSelectedTournament("new")}
              className="tournament-button add-button"
            >
              ➕ Add Tournament
            </button>
          </div>

          <hr/>

          {/* Weapons */}
          <h2>Weapons</h2>
          <div className="weapon-list">
            {weapons.map((w) => (
              <button
                key={w.WeaponId}
                onClick={() => setSelectedWeapon(w)}
                className="weapon-button"
              >
                {w.WeaponName}
              </button>
            ))}
            <button
              onClick={() => setSelectedWeapon("new")}
              className="weapon-button add-button"
            >
              ➕ Add Weapon
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// Wrap with RefreshProvider
const TournamentManagementWithProvider: React.FC = () => (
  <RefreshProvider>
    <TournamentManagement />
  </RefreshProvider>
);

export default TournamentManagementWithProvider;

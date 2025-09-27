/**
 * src/components/Manager/FighterManagement.tsx
 *
 * === Fighter Management ===
 * Primary: TournamentFighterForm (two columns).
 * Clubs: fetched here; renders one-line ClubEntryForm rows (incl. a "new club" row).
 * Footer: action bar with Manage Clubs + Add New Fighter
 */

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { RefreshProvider, useRefresh } from "../utility/RefreshContext";
import { backend_uri, club_api, tournament_api } from "../utility/endpoints";

import TournamentFighterForm from "./fighterSubComponents/TournamentFighterForm";
import ClubEntryForm, { Club } from "./fighterSubComponents/ClubEntryForm";
import FighterEntryForm from "./fighterSubComponents/FighterEntryForm";
import FloatingNav from "../utility/FloatingNav"

const FighterManagement: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const numericTournamentId = tournamentId ? parseInt(tournamentId, 10) : undefined;
  const { refreshKey } = useRefresh();

  const [tournamentName, setTournamentName] = useState<string>("");
  const [activePane, setActivePane] = useState<string | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);

  const fetchTournament = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const response = await fetch(
        `${backend_uri}/${tournament_api}?id=${tournamentId}`
      );
      const data = await response.json();
      if (data.status === "success" && data.tournament) {
        setTournamentName(data.tournament.TournamentName);
      }
    } catch (err) {
      console.error("Error fetching tournament:", err);
    }
  }, [tournamentId]);

  const fetchClubs = useCallback(async () => {
    try {
      const resp = await fetch(`${backend_uri}/${club_api}`);
      const data = await resp.json();
      if (data.status === "success" && Array.isArray(data.clubs)) {
        setClubs(data.clubs);
      } else {
        console.error("Error fetching clubs:", data.message);
      }
    } catch (e) {
      console.error("Error fetching clubs:", e);
    }
  }, []);

  useEffect(() => {
    fetchTournament();
  }, [refreshKey, fetchTournament]);

  const togglePane = (pane: string) => {
    setActivePane((prev) => (prev === pane ? null : pane));
    if (pane === "clubs" || pane === "fighters") {
      fetchClubs(); // ensure dropdowns are fresh
    }
  };

  return (
    <div className="fighter-management">
      {/* Primary view: two-column tournament fighter management */}
      {tournamentId && (
        <TournamentFighterForm
          tournamentId={Number(tournamentId)}
          tournamentName={tournamentName}
        />
      )}

      {/* Footer action bar */}
      <div
        className="fighter-actions"
        style={{
          marginTop: "1rem",
          display: "flex",
          gap: "1rem",
          justifyContent: "center",
        }}
      >
        <button onClick={() => togglePane("clubs")}>
          {activePane === "clubs" ? "Close Clubs" : "Manage Clubs"}
        </button>
        <button onClick={() => togglePane("fighters")}>
          {activePane === "fighters" ? "Close Add Fighter" : "Add New Fighter"}
        </button>
      </div>

      {/* Manage Clubs pane */}
      {activePane === "clubs" && (
        <div
          className="clubs-pane"
          style={{
            marginTop: "0.75rem",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "0.75rem",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Clubs</h2>

          <div style={{ marginBottom: "0.5rem", fontWeight: 600 }}>
            Add New Club
          </div>
          <ClubEntryForm onClubsUpdated={fetchClubs} />

          <div
            style={{
              marginTop: "1rem",
              marginBottom: "0.5rem",
              fontWeight: 600,
            }}
          >
            Existing
          </div>
          <div role="list" aria-label="clubs list">
            {clubs.map((club) => (
              <ClubEntryForm
                key={club.ClubId}
                club={club}
                onClubsUpdated={fetchClubs}
              />
            ))}
            {!clubs.length && <div style={{ opacity: 0.7 }}>No clubs yet.</div>}
          </div>
        </div>
      )}

      {/* Add Fighter pane */}
      {activePane === "fighters" && tournamentId && (
        <div
          className="fighters-pane"
          style={{
            marginTop: "0.75rem",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "0.75rem",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Add New Fighter</h2>
          {clubs.length > 0 ? (
            <FighterEntryForm
              fighter={undefined}
              clubs={clubs}
              tournamentId={Number(tournamentId)}
              tournamentName={tournamentName}
              onUpdated={() => {
                /* TournamentFighterForm will refetch via RefreshContext */
              }}
            />
          ) : (
            <div>Loading clubs...</div>
          )}
        </div>
      )}

      {numericTournamentId !== undefined && (
        <FloatingNav
          tournamentId={numericTournamentId}
          backUrl="/manager/tournament"
          links={[
            { text: "Scorekeeping", to: `/manager/tournament/${numericTournamentId}` },
            { text: "Edit Matches", to: `/manager/matching/${numericTournamentId}` }
          ]}
        />
      )}

    </div>
  );
};

const FighterManagementWithProvider: React.FC = () => (
  <RefreshProvider>
    <FighterManagement />
  </RefreshProvider>
);

export default FighterManagementWithProvider;

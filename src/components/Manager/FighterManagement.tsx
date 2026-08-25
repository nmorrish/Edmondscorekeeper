/**
 * src/components/Manager/FighterManagement.tsx
 *
 * === Fighter Management ===
 * Primary: TournamentFighterForm (two columns).
 * Then: collapsible EventFighterForm for each event in tournament (starts collapsed).
 * Footer: action bar with Manage Clubs + Add New Fighter.
 */

import React, { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { useParams } from "react-router-dom";
import { RefreshProvider, useRefresh } from "../utility/RefreshContext";
import { backend_uri, club_api, tournament_api, event_api } from "../utility/endpoints";

import TournamentFighterForm from "./fighterSubComponents/TournamentFighterForm";
// Lazy-load the per-event form to keep initial bundle small
const EventFighterForm = lazy(() => import("./fighterSubComponents/EventFighterForm"));

import ClubEntryForm, { Club } from "./fighterSubComponents/ClubEntryForm";
import FighterEntryForm from "./fighterSubComponents/FighterEntryForm";
import FloatingNav from "../utility/FloatingNav";
import { apiQuery } from "../utility/apiClient";

interface EventSummary {
  EventId: number;
  EventName: string;
}

const FighterManagement: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const numericTournamentId = tournamentId ? parseInt(tournamentId, 10) : undefined;
  const { refreshKey } = useRefresh();

  const [tournamentName, setTournamentName] = useState<string>("");
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [openEvents, setOpenEvents] = useState<Record<number, boolean>>({});
  const [activePane, setActivePane] = useState<string | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);

  // ---------- Fetch: Clubs (for Add Fighter / Manage Clubs panes) ----------
  const fetchClubs = useCallback(async () => {
    try {
      const resp = await apiQuery(`${backend_uri}/${club_api}`);
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

  // ---------- Effects ----------
  useEffect(() => {
    if (!tournamentId) return;

    const run = async () => {
      try {
        const tournamentResp = await apiQuery(`${backend_uri}/${tournament_api}?id=${tournamentId}`);
        const tournamentData = await tournamentResp.json();
        if (tournamentData.status === "success" && tournamentData.tournament) {
          setTournamentName(tournamentData.tournament.TournamentName);
        }

        const eventsResp = await apiQuery(`${backend_uri}/${event_api}?tournamentId=${tournamentId}`);
        const eventsData = await eventsResp.json();
        if (eventsData.status === "success" && Array.isArray(eventsData.events)) {
          setEvents(eventsData.events);
        } else {
          setEvents([]);
        }
      } catch (err) {
        console.error("Error fetching tournament or events:", err);
        setEvents([]);
      }
    };

    run();
  }, [tournamentId, refreshKey]);

  // ---------- UI Toggles ----------
  const togglePane = (pane: string) => {
    setActivePane((prev) => (prev === pane ? null : pane));
    if (pane === "clubs" || pane === "fighters") {
      fetchClubs(); // ensure dropdowns are fresh
    }
  };

  const toggleEvent = (eventId: number) => {
    setOpenEvents((prev) => ({ ...prev, [eventId]: !prev[eventId] }));
  };

  // ---------- Render ----------
  return (
    <div className="fighter-management">

      {numericTournamentId !== undefined && (
        <div className="select-button-container">
          <div className="selection-nav-bar" style={{ background: "#272727", padding: "10px", minHeight: "44px" }}>
            <h2 style={{ margin: 0 }}>{tournamentName}</h2>
            <div className="selection-nav-menu-slot">
              <FloatingNav
                tournamentId={numericTournamentId}
                variant="embedded"
                backUrl="/manager/tournament"
                links={[
                  { text: "Scorekeeping", to: `/manager/tournament/${numericTournamentId}` },
                  { text: "Edit Matches", to: `/manager/matching/${numericTournamentId}` },
                ]}
              />
            </div>
          </div>
        </div>
      )}

      {/* Event-specific fighter management (collapsible, starts collapsed) */}
      {events.length > 0 && (
        <div className="event-fighter-sections" style={{ marginTop: "3.0rem" }}>
          {events.map((ev) => (
            <div key={ev.EventId} className="event-fighter-section">
              <div className="event-fighter-header">
                <h3 style={{ margin: 0 }}>{ev.EventName}</h3>
                <button onClick={() => toggleEvent(ev.EventId)}>
                  {openEvents[ev.EventId] ? "Stop Editing Fighters" : "Edit Fighters"}
                </button>
              </div>

              {openEvents[ev.EventId] && (
                <div style={{ padding: "0.75rem" }}>
                  <Suspense fallback={<div>Loading event fighters…</div>}>
                    <EventFighterForm
                      key={`form-${ev.EventId}`}
                      eventId={ev.EventId}
                      eventName={ev.EventName}
                      tournamentId={Number(tournamentId)}
                      tournamentName={tournamentName}
                    />
                  </Suspense>
                </div>
              )}
            </div>
          ))}
        </div>
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
        <button onClick={() => togglePane("clubs")} style={{padding: "1.2rem 2rem", fontSize: "1.5rem"}}>
          {activePane === "clubs" ? "Close Clubs" : "Manage Clubs"}
        </button>
        <button onClick={() => togglePane("fighters")} style={{padding: "1.2rem 2rem", fontSize: "1.5rem"}}>
          {activePane === "fighters" ? "Close Add Fighter" : "Add New Fighter"}
        </button>
      </div>
      <br></br>
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
            />
          ) : (
            <div>Loading clubs...</div>
          )}
        </div>
      )}

            {/* Tournament-wide fighter management */}
      {tournamentId && (
        <TournamentFighterForm
          tournamentId={Number(tournamentId)}
          tournamentName={tournamentName}
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

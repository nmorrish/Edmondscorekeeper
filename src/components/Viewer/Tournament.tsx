/**
 * src/components/Viewer/Tournament.tsx
 *
 * === Tournament Viewer ===
 * Displays one tournament's info + events.
 * Events are shown as buttons in a horizontal row.
 * Clicking a button expands inline content below the row
 * with event details and weapon requirements.
 */

import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { backend_uri, tournament_view_api } from "../utility/endpoints";
import FloatingNav from "../utility/FloatingNav";
import { apiQuery } from "../utility/apiClient";

// --- Types ---
interface Tournament {
  TournamentId: number;
  TournamentName: string;
  TournamentStartDate: string;
  TournamentEndDate: string;
  TournamentDescription: string;
  TournamentRules: string;
}

interface Weapon {
  WeaponId: number;
  WeaponName: string;
  WeaponRequirements: string;
  GearRequirements: string;
}

interface Event {
  EventId: number;
  EventName: string;
  EventRules: string;
  MaxRings: number;
  Weapon: Weapon;
}

// --- Component ---
const Tournament: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  useEffect(() => {
    if (!tournamentId) return;

    apiQuery(`${backend_uri}/${tournament_view_api}?tournamentId=${tournamentId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success") {
          setTournament(data.tournament);
          setEvents(data.events);
        } else {
          console.error("API error", data.message);
        }
      })
      .catch((err) => console.error("Tournament fetch error", err));
  }, [tournamentId]);

  if (!tournament) {
    return <div>Loading tournament...</div>;
  }

  return (
    <div>
      {/* Top nav bar */}
      <div className="select-button-container">
        <div className="selection-nav-bar">
          <div className="event-selection-buttons">
            {events.map((event) => (
              <button
                key={`nav-${event.EventId}`}
                onClick={() =>
                  setSelectedEvent(
                    selectedEvent?.EventId === event.EventId ? null : event
                  )
                }
                className={
                  selectedEvent?.EventId === event.EventId ? "active-event" : ""
                }
              >
                {event.EventName}
              </button>
            ))}
          </div>
          <div className="selection-nav-menu-slot">
            <FloatingNav
              tournamentId={Number(tournamentId)}
              variant="embedded"
              backUrl="/"
              links={[
                { text: "Roster", to: `/viewer/schedules/${tournamentId}` },
                { text: "Standings", to: `/viewer/standings/${tournamentId}` },
                { text: "Scores", to: `/viewer/scores/${tournamentId}` },
              ]}
            />
          </div>
        </div>
      </div>
      
      {/* Tournament Info */}
      <h1 style={{marginTop:'60px'}}>{tournament.TournamentName}</h1>
      <p>
        {new Date(tournament.TournamentStartDate).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}{" "}
        –{" "}
        {new Date(tournament.TournamentEndDate).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </p>
      <p>{tournament.TournamentDescription}</p>

      <div className="card">
        <aside><a href="https://docs.google.com/document/d/199Fv7u0r1hDZ2DKqVn2HE3zVmvJ1w4b5/edit#heading=h.1fob9te" target="_blank"><strong>Click Here</strong> to read the rules for our <strong>new scoring system</strong>. Give them a read if you can. We don't want you left in the dark.</a></aside>
        <h2>Tournament Rules</h2>
        <p>{tournament.TournamentRules}</p>
      </div>

      {/* Events List */}
      <div>
        <br/><br/>
        <h2>Click to see Events</h2>
        <hr/>
        <div
          className="tournament-list"
          style={{ display: "flex", gap: "10px", flexWrap: "wrap", flexDirection: "row", justifyContent: "center" }}
        >
          {events.map((event) => (
            <button
              key={event.EventId}
              onClick={() =>
                setSelectedEvent(
                  selectedEvent?.EventId === event.EventId ? null : event
                )
              }
              className="tournament-button"
            >
              {event.EventName}
            </button>
          ))}
        </div>

        {/* Inline event details below all buttons */}
        {selectedEvent && (
          <div style={{ marginTop: "20px", textAlign: "left" }}>
            <h2 style={{ fontSize: "2rem" }}>{selectedEvent.EventName}</h2>
            <div style={{ display: "flex", flexDirection: "row", gap: "4px", marginBottom: "1rem", justifyContent:"center" }}>
              <a className="button" href={`/viewer/schedules/${tournamentId}`}>See Match Rosters</a>
              <a className="button" href={`/viewer/scores/${tournamentId}`}>See Score Breakdowns</a>
              <a className="button" href={`/viewer/standings/${tournamentId}`}>See Event Standings</a>
            </div>

            <div className="card">
              <h3>{selectedEvent.EventName} Rules</h3>
              <p>{selectedEvent.EventRules}</p>
            </div>
            <div className="card">
              <h3>{selectedEvent.Weapon.WeaponName} Requirements</h3>
              <p>{selectedEvent.Weapon.WeaponRequirements}</p>
            </div>
            <div className="card">
              <h3>{selectedEvent.Weapon.WeaponName} Gear Requirements</h3>
              <p>{selectedEvent.Weapon.GearRequirements}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Tournament;

/**
 * src/components/Viewer/Tournament.tsx
 *
 * === Tournament Viewer ===
 * Displays one tournament's info + events.
 * Events are shown as buttons in a horizontal row.
 * Clicking a button expands inline content below the row
 * with event details and weapon requirements.
 */

import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { backend_uri, tournament_view_api, video_export_api } from "../utility/endpoints";
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

  type ExportState = "checking" | "locked" | "idle" | "building" | "ready" | "error";
  const [exportState, setExportState] = useState<ExportState>("checking");
  const [exportError, setExportError] = useState<string>("");
  const startedRef = useRef(false);
  const pollRef = useRef<number | null>(null);

  const statusUrl = `${backend_uri}/${video_export_api}?action=status&tournamentId=${tournamentId}`;
  const downloadUrl = `${backend_uri}/${video_export_api}?action=download&tournamentId=${tournamentId}`;

  const applyStatus = (data: any) => {
    if (data?.status !== "ok") {
      setExportState("error");
      setExportError(data?.message || "Status check failed");
      return;
    }
    if (!data.allowed) { setExportState("locked"); return; }
    const s = data.build?.state;
    if (s === "ready") setExportState("ready");
    else if (s === "building") setExportState("building");
    else if (s === "error") { setExportState("error"); setExportError(data.build?.message || "Build failed"); }
    else setExportState("idle");
  };

  const triggerDownload = () => { window.location.href = downloadUrl; };

  const startExport = () => {
    setExportError("");
    startedRef.current = true;
    setExportState("building");
    apiQuery(`${backend_uri}/${video_export_api}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `action=start&tournamentId=${tournamentId}`,
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.status !== "ok") {
          setExportState(d?.allowed === false ? "locked" : "error");
          setExportError(d?.message || "Could not start export");
          startedRef.current = false;
          return;
        }
        setExportState(d.build?.state === "ready" ? "ready" : "building");
      })
      .catch(() => {
        setExportState("error");
        setExportError("Could not start export");
        startedRef.current = false;
      });
  };

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

  // Initial guard/status check
  useEffect(() => {
    if (!tournamentId) return;
    let cancelled = false;
    apiQuery(statusUrl)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) applyStatus(d); })
      .catch(() => { if (!cancelled) { setExportState("error"); setExportError("Status check failed"); } });
    return () => { cancelled = true; };
  }, [tournamentId]);

  // Poll while a build is in progress
  useEffect(() => {
    if (exportState !== "building") {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = window.setInterval(() => {
      apiQuery(statusUrl).then((r) => r.json()).then(applyStatus).catch(() => {});
    }, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [exportState, tournamentId]);

  // Auto-download only when this user's build finishes
  useEffect(() => {
    if (exportState === "ready" && startedRef.current) {
      startedRef.current = false;
      triggerDownload();
    }
  }, [exportState]);

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

      <div style={{ marginTop: "1rem" }}>
        {exportState === "checking" && <button disabled>Checking export…</button>}
        {exportState === "locked" && (
          <button disabled title="Available once the tournament end time has passed">
            Video export locked until tournament ends
          </button>
        )}
        {exportState === "idle" && (
          <button onClick={startExport}>Export all videos (.zip)</button>
        )}
        {exportState === "building" && (
          <button disabled>Preparing zip… this can take a while</button>
        )}
        {exportState === "ready" && (
          <button onClick={triggerDownload}>Download videos (.zip)</button>
        )}
        {exportState === "error" && (
          <>
            <button onClick={startExport}>Retry video export</button>
            {exportError && <p style={{ color: "#ff6b6b" }}>{exportError}</p>}
          </>
        )}
      </div>

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
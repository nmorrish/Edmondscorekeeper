/**
 * src/components/Manager/MatchManagement.tsx
 */

import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import MatchFightersManual from "./matchSubComponents/MatchFightersManual";
import MatchRoundRobinPools from "./matchSubComponents/roundRobinPools/MatchRoundRobinPools";
import MatchSingleElim from "../Manager/matchSubComponents/singleElim/MatchSingleElim";
import useTournamentFighters from "./subComponents/useTournamentFighters";
import useEvents from "./subComponents/useEvents";
import useTournaments from "./subComponents/useTournaments";
import FloatingNav from "../utility/FloatingNav";
import { RefreshProvider, useRefresh } from "../utility/RefreshContext";
import { backend_uri, event_api } from "../utility/endpoints";
import {
  safeParseJson,
  normalizeMatchFormat,
  sanitizeArray,
} from "../utility/dataGuards";
import { apiQuery } from "../utility/apiClient";
import MatchDoubleElim from "./matchSubComponents/doubleElim/MatchDoubleElim";

type MatchType =
  | "manual"
  | "roundRobinPools"
  | "singleElimination"
  | "doubleElimination";

const MatchManagement: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const numericTournamentId = tournamentId ? parseInt(tournamentId, 10) : null;

  // Hard precondition: tournamentId must exist
  if (!numericTournamentId) {
    return <div>Error: Tournament ID is required to view this page.</div>;
  }

  // Tournament info
  const { tournaments } = useTournaments();
  const tournament = tournaments.find(
    (t) => Number(t.TournamentId) === numericTournamentId
  );

  // Fighters
  const {
    fighters,
    loading: fightersLoading,
    error: fightersError,
    fetchTournamentFighters,
  } = useTournamentFighters(numericTournamentId);
  const { refreshKey } = useRefresh();

  // Events
  const {
    events: rawEvents,
    loading: eventsLoading,
    error: eventsError,
  } = useEvents(refreshKey, numericTournamentId);
  const events = sanitizeArray(rawEvents);

  // Selected event + match type
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [matchType, setMatchType] = useState<MatchType>("manual"); // truth from API
  const [viewType, setViewType] = useState<MatchType>("manual"); // UI state

  // Fetch format when an event is selected
  useEffect(() => {
    if (!selectedEventId) return;

    const controller = new AbortController();
    const { signal } = controller;

    const fetchFormat = async () => {
      try {
        const url = `${backend_uri}/${event_api}?eventId=${selectedEventId}&format=1`;

        const res = await apiQuery(url, { signal }).catch((e) => {
          console.error("[format-fetch] network error:", e?.message || e);
          return null;
        });

        if (!res) {
          console.warn("[format-fetch] no response object");
          return;
        }

        const bodyText = await res.text().catch((e) => {
          console.error("[format-fetch] error reading body:", e?.message || e);
          return null;
        });

        const data = safeParseJson(bodyText);

        if (
          res.ok &&
          data &&
          typeof data === "object" &&
          data.status === "success"
        ) {
          const apiFormat = normalizeMatchFormat(String(data.format));
          setMatchType(apiFormat);
          setViewType(apiFormat);
        } else {
          console.warn("[format-fetch] unexpected payload or status", {
            status: res.status,
            bodyPreview:
              typeof bodyText === "string"
                ? bodyText.slice(0, 200)
                : "(no body)",
          });
          setMatchType("manual");
          setViewType("manual");
        }
      } catch (err) {
        console.error("[format-fetch] unhandled error:", err);
        setMatchType("manual");
        setViewType("manual");
      }
    };

    fetchFormat();

    return () => controller.abort();
  }, [selectedEventId]);

  // Refetch fighters on refresh
  useEffect(() => {
    fetchTournamentFighters();
  }, [refreshKey, fetchTournamentFighters]);

  const tournamentName = tournament
    ? tournament.TournamentName
    : `Tournament ${numericTournamentId}`;

  if (fightersLoading || eventsLoading) return <div>Loading data…</div>;
  if (fightersError) return <div>Error loading fighters: {fightersError}</div>;
  if (eventsError) return <div>Error loading events: {eventsError}</div>;

  const selectedEvent = events.find(
    (e: any) => Number(e.EventId) === selectedEventId
  );

  //eventId must exist
  if (!selectedEvent) {
    return (
      <div style={{ marginTop: "2rem" }}>
        <h2>Please select an event for {tournamentName}</h2>
        <div
          className="event-toolbar"
          style={{
            marginTop: "1rem",
            display: "flex",
            justifyContent: "center",
            gap: "0.5rem",
          }}
        >
          {events.map((event: any) => (
            <button
              key={`event-${event.EventId}`}
              onClick={() => setSelectedEventId(Number(event.EventId))}
              style={{
                background:
                  selectedEventId === Number(event.EventId) ? "#555" : "#333",
                color: "#fff",
                padding: "0.5rem 1rem",
                border: "1px solid #444",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              {event.EventName}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="App"
      style={{ width: "100%", display: "flex", flexDirection: "column" }}
    >
      {/* Toolbar with events */}
      <div
        className="event-toolbar"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          background: "#222",
          padding: "0.5rem",
          display: "flex",
          justifyContent: "center",
          gap: "0.5rem",
          zIndex: 1000,
        }}
      >
        {events.map((event: any) => (
          <button
            key={`event-${event.EventId}`}
            onClick={() => setSelectedEventId(Number(event.EventId))}
            style={{
              background:
                selectedEventId === Number(event.EventId) ? "#555" : "#333",
              color: "#fff",
              padding: "0.5rem 1rem",
              border: "1px solid #444",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            {event.EventName}
          </button>
        ))}
      </div>

      {/* Inner wrapper */}
      <div
        style={{
          paddingTop: "3rem",
          width: "100%",
          maxWidth: "1200px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <header className="App-header">
          <h1>
            {tournamentName} - {selectedEvent.EventName} matches
          </h1>
        </header>

        {/* Match type selector */}
        <div
          className="match-type-toolbar"
          style={{
            margin: "1rem 0",
            display: "flex",
            justifyContent: "center",
            gap: "1rem",
          }}
        >
          {(
            [
              "manual",
              "roundRobinPools",
              "singleElimination",
              "doubleElimination",
            ] as MatchType[]
          ).map((type) => (
            <button
              key={type}
              onClick={() => setViewType(type)}
              style={{
                background: viewType === type ? "#007bff" : "",
                color: "#fff",
                padding: viewType === type ? "1rem 1.5rem" : "0.5rem 1rem",
                fontSize: viewType === type ? "1.2rem" : "1rem",
                fontWeight: viewType === type ? "bold" : "normal",
                borderRadius: "6px",
                transform: viewType === type ? "scale(1.05)" : "scale(1)",
                transition: "all 0.2s ease-in-out",
              }}
            >
              {type === "manual"
                ? "Manual"
                : type === "roundRobinPools"
                ? "Round Robin Pools"
                : type === "singleElimination"
                ? "Single Elimination"
                : "Double Elimination"}
            </button>
          ))}
        </div>

        {/* Matching UI */}
        <div className="matching-section" style={{ marginTop: "1.5rem" }}>
          {viewType === "manual" && (
            <MatchFightersManual
              fighters={fighters}
              eventId={Number(selectedEvent.EventId)}
              maxRings={selectedEvent.MaxRings || 1}
              isActive={matchType === "manual"}
              readOnly={false} 
              tournamentId={numericTournamentId}
            />
          )}

          {viewType === "roundRobinPools" && (
            <MatchRoundRobinPools
              eventId={Number(selectedEvent.EventId)}
              eventName={selectedEvent.EventName}
              maxRings={selectedEvent.MaxRings || 1}
              isActive={matchType === "roundRobinPools"}
              readOnly={false} 
              tournamentId={numericTournamentId}
            />
          )}

          {viewType === "singleElimination" && (
            <MatchSingleElim
              eventId={Number(selectedEvent.EventId)}
              eventName={selectedEvent.EventName}
              maxRings={selectedEvent.MaxRings || 1}
              isActive={matchType === "singleElimination"}
              tournamentId={numericTournamentId}
              readOnly={false} 
            />
          )}

          {viewType === "doubleElimination" && (
            <MatchDoubleElim
              eventId={Number(selectedEvent.EventId)}
              eventName={selectedEvent.EventName}
              maxRings={selectedEvent.MaxRings || 1}
              isActive={matchType === "doubleElimination"}
              tournamentId={numericTournamentId}
              readOnly={false}
            />
          )}
        </div>
      </div>

      <FloatingNav
        tournamentId={numericTournamentId}
        backUrl="/manager/tournament"
        links={[
          {
            text: "Scorekeeping",
            to: `/manager/tournament/${numericTournamentId}`,
          },
          {
            text: "Edit Fighters",
            to: `/manager/fighters/${numericTournamentId}`,
          },
        ]}
      />
    </div>
  );
};

// Wrap in RefreshProvider
const MatchManagementWithProvider: React.FC = () => (
  <RefreshProvider>
    <MatchManagement />
  </RefreshProvider>
);

export default MatchManagementWithProvider;

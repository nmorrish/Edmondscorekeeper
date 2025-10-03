import React, { useState } from "react";
import { backend_uri, tournament_api } from "../../utility/endpoints";
import { Tournament } from "../subComponents/useTournaments";
import useEvents from "./useEvent";
import EventForm from "./EventForm";
import { apiQuery } from "../../utility/apiClient";

interface Props {
  tournament: Tournament | null;  // null → add new
  onClose: () => void;
  onSaved: () => void;            // callback to refresh parent list
}

const TournamentForm: React.FC<Props> = ({ tournament, onClose, onSaved }) => {
  const [formData, setFormData] = useState({
    name: tournament?.TournamentName || "",
    startDate: tournament?.TournamentStartDate || "",
    endDate: tournament?.TournamentEndDate || "",
    description: tournament?.TournamentDescription || "",
    rules: tournament?.TournamentRules || "",
  });

  // Fetch all events for this tournament
  const { events, loading: eventsLoading, error: eventsError } = useEvents(
    0,
    tournament?.TournamentId
  );
  const tournamentEvents = events.filter(
    (e) => e.tournamentId === tournament?.TournamentId
  );

  const [newEventForms, setNewEventForms] = useState<number[]>([]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = tournament ? "PUT" : "POST";
      const url = tournament
        ? `${backend_uri}/${tournament_api}?id=${tournament.TournamentId}`
        : `${backend_uri}/${tournament_api}`;

      const response = await apiQuery(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (data.status === "success") {
        onSaved();
        onClose();
      } else {
        alert("Error: " + data.message);
      }
    } catch {
      alert("Failed to save tournament.");
    }
  };

  const handleDelete = async () => {
    if (!tournament) return;
    if (!window.confirm("Are you sure you want to delete this tournament?")) {
      return;
    }
    try {
      const response = await apiQuery(
        `${backend_uri}/${tournament_api}?id=${tournament.TournamentId}`,
        { method: "DELETE" }
      );
      const data = await response.json();
      if (data.status === "success") {
        onSaved();
        onClose();
      } else {
        alert("Error: " + data.message);
      }
    } catch {
      alert("Failed to delete tournament.");
    }
  };

  return (
    <div className="tournament-form">
      <h3>{tournament ? "Edit Tournament" : "Add Tournament"}</h3>
      <form onSubmit={handleSubmit}>
        <label>
          Tournament Name:
          <input
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          Start Date:
          <input
            type="datetime-local"
            name="startDate"
            value={formData.startDate}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          End Date:
          <input
            type="datetime-local"
            name="endDate"
            value={formData.endDate}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          Tournament Description:
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          Rules universal to all events in tournament:
          <textarea
            name="rules"
            value={formData.rules}
            onChange={handleChange}
            required
          />
        </label>

        <div className="form-actions">
          <button type="submit">{tournament ? "Save" : "Create"}</button>
          {tournament && (
            <button
              type="button"
              className="delete-button"
              onClick={handleDelete}
            >
              Delete
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>

      <hr />

      {/* Events Section */}
      {tournament && (
        <div className="events-section">
          {eventsLoading && <p>Loading events...</p>}
          {eventsError && <p style={{ color: "red" }}>{eventsError}</p>}

          {/* Existing events */}
          {tournamentEvents.map((ev) => (
            <div id={`event-${ev.id}`} key={ev.id}>
              <EventForm
                event={ev}
                tournamentId={tournament.TournamentId}
                onClose={() => {}}
                onSaved={onSaved}
              />
            </div>
          ))}

          {/* New event forms */}
          {newEventForms.map((id) => (
            <EventForm
              key={`new-${id}`}
              event={null}
              tournamentId={tournament.TournamentId}
              onClose={() =>
                setNewEventForms((prev) => prev.filter((n) => n !== id))
              }
              onSaved={onSaved}
              onCreated={(newId) => {
                const el = document.getElementById(`event-${newId}`);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
            />
          ))}

          <button
            type="button"
            onClick={() => setNewEventForms((prev) => [...prev, Date.now()])}
          >
            ➕ Add Event
          </button>
        </div>
      )}

      <button type="button" onClick={onClose}>
        ◀&nbsp;&nbsp;&nbsp;Go back
      </button>
    </div>
  );
};

export default TournamentForm;

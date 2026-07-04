/**
 * src/components/utility/SelectionNavbar.tsx
 *
 * Two-tier event/ring selection bar with embedded navigation menu.
 * Desktop: button rows. Mobile: select dropdowns.
 * Selection state is stateless — driven entirely by props.
 */
import React from "react";
import FloatingNav from "./FloatingNav";

export interface NavEvent {
  EventId: number;
  EventName: string;
  MaxRings: number;
}

interface SelectionNavbarProps {
  events: NavEvent[];
  selectedEvent: number | null;
  selectedRing: number | null;
  onEventSelect: (eventId: number) => void;
  onRingSelect: (ring: number) => void;
  tournamentId: number;
  navLinks: { text: string; to: string }[];
  backUrl: string;
}

const SelectionNavbar: React.FC<SelectionNavbarProps> = ({
  events,
  selectedEvent,
  selectedRing,
  onEventSelect,
  onRingSelect,
  tournamentId,
  navLinks,
  backUrl,
}) => {
  const maxRings = events.find(e => e.EventId === selectedEvent)?.MaxRings ?? 0;
  const rings = Array.from({ length: maxRings }, (_, i) => i + 1);

  return (
    <div className="select-button-container">

      {/* Embedded hamburger nav — centered against the entire bar */}
      <div className="selection-nav-menu-slot">
        <FloatingNav
          variant="embedded"
          tournamentId={tournamentId}
          links={navLinks}
          backUrl={backUrl}
        />
      </div>

      {/* ── Event row ── */}
      <div className="selection-nav-bar">
        <div className="event-selection-buttons selection-nav-desktop">
          {events.map(e => (
            <button
              key={e.EventId}
              onClick={() => onEventSelect(e.EventId)}
              className={selectedEvent === e.EventId ? "active-event" : ""}
            >
              {e.EventName}
            </button>
          ))}
        </div>

        <div className="event-selection-buttons selection-nav-mobile">
          <select
            value={selectedEvent ?? ""}
            onChange={e => onEventSelect(Number(e.target.value))}
          >
            <option value="" disabled>Select Event</option>
            {events.map(e => (
              <option key={e.EventId} value={e.EventId}>{e.EventName}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Ring row ── */}
      {selectedEvent && maxRings > 0 && (
        <>
          <div className="ring-selection-buttons selection-nav-desktop">
            {rings.map(r => (
              <button
                key={r}
                onClick={() => onRingSelect(r)}
                className={selectedRing === r ? "active-ring" : ""}
              >
                Ring {r}
              </button>
            ))}
          </div>

          <div className="ring-selection-buttons selection-nav-mobile">
            <select
              value={selectedRing ?? ""}
              onChange={e => onRingSelect(Number(e.target.value))}
            >
              <option value="" disabled>Select Ring</option>
              {rings.map(r => (
                <option key={r} value={r}>Ring {r}</option>
              ))}
            </select>
          </div>
        </>
      )}

    </div>
  );
};

export default SelectionNavbar;
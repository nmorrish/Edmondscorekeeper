/**
 * src/components/Manager/matchSubComponents/MatchSingleElimFighterManager.tsx
 *
 * === Manage Event Fighters for Single Elimination ===
 * Modal to add/remove fighters from an event.
 * - Left: Event fighters (already in event, remove with ←)
 * - Right: Tournament fighters not in event (add with →)
 *
 * Optimistic updates for add/remove.
 * React refresh triggered only when closing the modal.
 */

import React, { useEffect, useState } from "react";
import {
  backend_uri,
  club_api,
  event_fighters_api,
  tournament_fighters_api,
} from "../../../utility/endpoints";
import { useToast } from "../../../utility/ToastProvider";
import { useRefresh } from "../../../utility/RefreshContext";

interface FighterUpper {
  FighterId: number;
  FighterName: string;
  ClubId: number | null;
  ClubName: string | null;
  ClubAcronym?: string | null;
}

interface Club {
  ClubId: number;
  ClubName: string;
  ClubAcronym?: string | null;
  ClubLogo?: string | null;
}

interface FighterManagerProps {
  eventId: number;
  tournamentId: number;
  onClose: () => void;
}

const EVENT_FIGHTERS_API = `${backend_uri}/${event_fighters_api}`;

const MatchSingleElimFighterManager: React.FC<FighterManagerProps> = ({
  eventId,
  tournamentId,
  onClose,
}) => {
  const addToast = useToast();
  const { triggerRefresh } = useRefresh();

  const [loading, setLoading] = useState(false);
  const [tournamentFighters, setTournamentFighters] = useState<FighterUpper[]>([]);
  const [eventFighters, setEventFighters] = useState<FighterUpper[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]); // kept for normalization (club acronyms)

  // ---------- Helpers ----------
  const safeJson = async (res: Response): Promise<any | null> => {
    try {
      return await res.json();
    } catch {
      return null;
    }
  };

  // Normalize mixed-case fighter payloads and enrich with club data if available
  const normalizeFighter = (f: any, clubById: Map<number, Club>): FighterUpper => {
    const clubId = f?.ClubId ?? f?.clubId ?? null;
    const club = clubId ? clubById.get(Number(clubId)) : null;
    return {
      FighterId: f?.FighterId ?? f?.fighterId,
      FighterName: f?.FighterName ?? f?.fighterName ?? "",
      ClubId: clubId,
      ClubName: club?.ClubName ?? f?.ClubName ?? f?.clubName ?? null,
      ClubAcronym: club?.ClubAcronym ?? f?.ClubAcronym ?? f?.clubAcronym ?? null,
    };
  };

  // ---------- Load Data ----------
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        // Load clubs (for acronyms)
        const clubsRes = await fetch(`${backend_uri}/${club_api}`);
        const clubsData = await safeJson(clubsRes);
        const clubList: Club[] =
          clubsRes.ok && clubsData?.status === "success" && Array.isArray(clubsData?.clubs)
            ? clubsData.clubs
            : [];
        if (!cancelled) setClubs(clubList);
        const clubById = new Map<number, Club>(clubList.map((c: Club) => [c.ClubId, c]));

        // Tournament fighters (all)
        const tfRes = await fetch(
          `${backend_uri}/${tournament_fighters_api}?tournamentId=${tournamentId}`
        );
        const tfData = await safeJson(tfRes);
        const tournamentAll: FighterUpper[] = Array.isArray(tfData?.fighters)
          ? (tfData.fighters as any[]).map((f) => normalizeFighter(f, clubById))
          : [];

        // Event fighters (already in event)
        const efRes = await fetch(`${EVENT_FIGHTERS_API}?eventId=${eventId}`);
        const efData = await safeJson(efRes);
        const eventList: FighterUpper[] = Array.isArray(efData?.fighters)
          ? (efData.fighters as any[]).map((f) => normalizeFighter(f, clubById))
          : [];

        // Filter tournament list to remove those already in event
        const eventIds = new Set<number>(eventList.map((f: FighterUpper) => f.FighterId));
        const tournamentFiltered = tournamentAll.filter(
          (f: FighterUpper) => !eventIds.has(f.FighterId)
        );

        if (!cancelled) {
          setTournamentFighters(tournamentFiltered);
          setEventFighters(eventList);
        }
      } catch (err) {
        console.error("Error loading fighters", err);
        if (!cancelled) addToast("Error loading fighters");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [eventId, tournamentId, addToast]);

  // ---------- Mutators ----------
  const handleAdd = (fighter: FighterUpper) => {
    // optimistic UI
    setEventFighters((prev) => [...prev, fighter]);
    setTournamentFighters((prev) =>
      prev.filter((f) => f.FighterId !== fighter.FighterId)
    );

    fetch(EVENT_FIGHTERS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, fighterId: fighter.FighterId }),
    })
      .then(safeJson)
      .then((data) => {
        if (!data || data.status !== "success") {
          throw new Error(data?.message || "Failed to add fighter");
        }
        addToast("Fighter added to event");
      })
      .catch((err) => {
        console.error("Error adding fighter", err);
        addToast("Error adding fighter");
        // rollback
        setTournamentFighters((prev) => [...prev, fighter]);
        setEventFighters((prev) =>
          prev.filter((f) => f.FighterId !== fighter.FighterId)
        );
      });
  };

  const handleRemove = (fighter: FighterUpper) => {
    // optimistic UI
    setTournamentFighters((prev) => [...prev, fighter]);
    setEventFighters((prev) =>
      prev.filter((f) => f.FighterId !== fighter.FighterId)
    );

    fetch(EVENT_FIGHTERS_API, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, fighterId: fighter.FighterId }),
    })
      .then(safeJson)
      .then((data) => {
        if (!data || data.status !== "success") {
          throw new Error(data?.message || "Failed to remove fighter");
        }
        addToast("Fighter removed from event");
      })
      .catch((err) => {
        console.error("Error removing fighter", err);
        addToast("Error removing fighter");
        // rollback
        setEventFighters((prev) => [...prev, fighter]);
        setTournamentFighters((prev) =>
          prev.filter((f) => f.FighterId !== fighter.FighterId)
        );
      });
  };

  // ---------- Close handler ----------
  const handleClose = () => {
    triggerRefresh();
    onClose();
  };

  // ---------- Render ----------
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 999,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        style={{
          background: "#1e1e1e",
          padding: "1rem",
          borderRadius: 10,
          width: "90%",
          maxWidth: "900px",
          maxHeight: "80%",
          overflowY: "auto",
          position: "relative",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1rem" }}>
          <button onClick={handleClose}>Close</button>
        </div>
        <h2 style={{ textAlign: "center" }}>Manage Event Fighters</h2>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "2rem",
            }}
          >
            {/* Left: Event Fighters */}
            <div>
              <h3>Event Fighters</h3>
              {eventFighters.length === 0 && <p>No fighters in event</p>}
              {eventFighters.map((f: FighterUpper) => (
                <div
                  key={f.FighterId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <span>
                    {f.FighterName}
                    {f.ClubAcronym ? ` (${f.ClubAcronym})` : ""}
                  </span>
                  <button onClick={() => handleRemove(f)}>Remove →</button>
                </div>
              ))}
            </div>

            {/* Right: Tournament Fighters */}
            <div>
              <h3>Tournament Fighters</h3>
              {tournamentFighters.length === 0 && <p>No fighters available to add</p>}
              {tournamentFighters.map((f: FighterUpper) => (
                <div
                  key={f.FighterId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <button onClick={() => handleAdd(f)}>← Add</button>
                  <span>
                    {f.FighterName}
                    {f.ClubAcronym ? ` (${f.ClubAcronym})` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchSingleElimFighterManager;

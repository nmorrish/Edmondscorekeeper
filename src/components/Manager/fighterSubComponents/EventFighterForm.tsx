/**
 * src/components/Manager/fighterSubComponents/EventFighterForm.tsx
 *
 * === Event Fighter Form ===
 * Two columns:
 *  - Left: Fighters IN event
 *  - Right: Fighters IN tournament but NOT in event
 *
 * Uses optimistic updates + RefreshContext for sync across components.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  backend_uri,
  club_api,
  event_fighters_api,
  tournament_fighters_api,
} from "../../utility/endpoints";
import { useToast } from "../../utility/ToastProvider";
import { useRefresh } from "../../utility/RefreshContext";
import FighterEntryForm from "./FighterEntryForm";

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

interface EventFighterFormProps {
  eventId: number;
  tournamentId: number;
  tournamentName: string;
  eventName: string;
}

const EventFighterForm: React.FC<EventFighterFormProps> = ({
  eventId,
  tournamentId,
  tournamentName,
  eventName,
}) => {
  const addToast = useToast();
  const { refreshKey, triggerRefresh } = useRefresh();

  const [inFighters, setInFighters] = useState<FighterUpper[]>([]);
  const [outFighters, setOutFighters] = useState<FighterUpper[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);

  const [searchIn, setSearchIn] = useState("");
  const [searchOut, setSearchOut] = useState("");

  // ---------- Normalizer ----------
  const toUpper = (f: any, clubById: Map<number, Club>): FighterUpper => {
    const clubId = f.ClubId ?? f.clubId ?? null;
    const club = clubId ? clubById.get(Number(clubId)) : null;
    return {
      FighterId: f.FighterId ?? f.fighterId,
      FighterName: f.FighterName ?? f.fighterName ?? "",
      ClubId: clubId,
      ClubName: club?.ClubName ?? f.ClubName ?? f.clubName ?? null,
      ClubAcronym: club?.ClubAcronym ?? null,
    };
  };

  // ---------- Load Data ----------
  const fetchClubsAndFighters = async () => {
    try {
      const res = await fetch(`${backend_uri}/${club_api}`);
      const data = await res.json();
      if (data.status === "success" && Array.isArray(data.clubs)) {
        setClubs(data.clubs);
      }

      const clubById = new Map<number, Club>(
        (data.clubs || []).map((c: Club) => [c.ClubId, c])
      );

      // Tournament fighters
      const resTF = await fetch(
        `${backend_uri}/${tournament_fighters_api}?tournamentId=${tournamentId}`
      );
      const dataTF = await resTF.json();
      if (dataTF.status !== "success" || !Array.isArray(dataTF.fighters)) {
        throw new Error(dataTF.message || "Failed to load tournament fighters");
      }
      const allUpper: FighterUpper[] = dataTF.fighters.map((f: any) =>
        toUpper(f, clubById)
      );

      // Event fighters
      const resIn = await fetch(`${backend_uri}/${event_fighters_api}?eventId=${eventId}`);
      const dataIn = await resIn.json();
      if (dataIn.status !== "success" || !Array.isArray(dataIn.fighters)) {
        throw new Error(dataIn.message || "Failed to load event fighters");
      }
      const inUpper: FighterUpper[] = dataIn.fighters.map((f: any) =>
        toUpper(f, clubById)
      );

      const inIds = new Set(inUpper.map((f) => f.FighterId));
      setInFighters(inUpper);
      setOutFighters(allUpper.filter((f) => !inIds.has(f.FighterId)));
    } catch (e) {
      console.error("Error loading fighters", e);
      addToast("Error loading fighters");
    }
  };

  useEffect(() => {
    fetchClubsAndFighters();
  }, [eventId, tournamentId, refreshKey]); // ✅ safe deps

  // ---------- Mutators (Optimistic + triggerRefresh) ----------
  const addToEvent = async (fighterId: number) => {
    const fighter = outFighters.find((f) => f.FighterId === fighterId);
    if (!fighter) return;

    setOutFighters((prev) => prev.filter((f) => f.FighterId !== fighterId));
    setInFighters((prev) => [...prev, fighter]);

    try {
      const res = await fetch(`${backend_uri}/${event_fighters_api}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, fighterId }),
      });
      const data = await res.json();
      if (data.status !== "success") throw new Error(data.message);
      addToast("Fighter added to event");
      triggerRefresh(); // 🔹 sync siblings
    } catch (e) {
      console.error("Error adding fighter to event", e);
      addToast("Error adding fighter to event");
      setInFighters((prev) => prev.filter((f) => f.FighterId !== fighterId));
      if (fighter) setOutFighters((prev) => [...prev, fighter]);
    }
  };

  const removeFromEvent = async (fighterId: number) => {
    const fighter = inFighters.find((f) => f.FighterId === fighterId);
    if (!fighter) return;

    setInFighters((prev) => prev.filter((f) => f.FighterId !== fighterId));
    setOutFighters((prev) => [...prev, fighter]);

    try {
      const res = await fetch(`${backend_uri}/${event_fighters_api}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, fighterId }),
      });
      const data = await res.json();
      if (data.status !== "success") throw new Error(data.message);
      addToast("Fighter removed from event");
      triggerRefresh(); // 🔹 sync siblings
    } catch (e) {
      console.error("Error removing fighter from event", e);
      addToast("Error removing fighter from event");
      setOutFighters((prev) => prev.filter((f) => f.FighterId !== fighterId));
      if (fighter) setInFighters((prev) => [...prev, fighter]);
    }
  };

  // ---------- Filtering ----------
  const filteredIn = useMemo(() => {
    const q = searchIn.trim().toLowerCase();
    if (!q) return inFighters;
    return inFighters.filter(
      (f) =>
        (f.FighterName || "").toLowerCase().includes(q) ||
        (f.ClubName || "").toLowerCase().includes(q) ||
        (f.ClubAcronym || "").toLowerCase().includes(q)
    );
  }, [searchIn, inFighters]);

  const filteredOut = useMemo(() => {
    const q = searchOut.trim().toLowerCase();
    if (!q) return outFighters;
    return outFighters.filter(
      (f) =>
        (f.FighterName || "").toLowerCase().includes(q) ||
        (f.ClubName || "").toLowerCase().includes(q) ||
        (f.ClubAcronym || "").toLowerCase().includes(q)
    );
  }, [searchOut, outFighters]);

  // ---------- Render ----------
  return (
    <div
      className="event-fighter-form"
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
    >
      {/* Left Column: IN event */}
      <section>
        <h2 style={{ textAlign: "center" }}>In {eventName}</h2>
        <input
          type="text"
          placeholder="Search fighters, club names, or acronyms..."
          value={searchIn}
          onChange={(e) => setSearchIn(e.target.value)}
          style={{ marginBottom: "0.75rem", width: "80%" }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {filteredIn.map((fighter) => (
            <div
              key={`in-${fighter.FighterId}`}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <FighterEntryForm
                fighter={fighter}
                clubs={clubs}
                tournamentId={tournamentId}
                tournamentName={tournamentName}
                inTournament={true}
                context="event"
              />
              <button onClick={() => removeFromEvent(fighter.FighterId)}>
                Remove →
              </button>
            </div>
          ))}
          {!filteredIn.length && <div>No fighters match your search.</div>}
        </div>
      </section>

      {/* Right Column: NOT in event */}
      <section>
        <h2 style={{ textAlign: "center" }}>Available (in tournament)</h2>
        <input
          type="text"
          placeholder="Search fighters, club names, or acronyms..."
          value={searchOut}
          onChange={(e) => setSearchOut(e.target.value)}
          style={{ marginBottom: "0.75rem", width: "80%" }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {filteredOut.map((fighter) => (
            <div
              key={`out-${fighter.FighterId}`}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <button onClick={() => addToEvent(fighter.FighterId)}>← Add</button>
              <FighterEntryForm
                fighter={fighter}
                clubs={clubs}
                tournamentId={tournamentId}
                tournamentName={tournamentName}
                inTournament={true}
                context="event"
              />
            </div>
          ))}
          {!filteredOut.length && <div>No fighters match your search.</div>}
        </div>
      </section>
    </div>
  );
};

export default EventFighterForm;

/**
 * src/components/Manager/fighterSubComponents/TournamentFighterForm.tsx
 *
 * === Tournament Fighter Form (Primary View) ===
 * Two columns:
 *  - Left: Fighters IN tournament
 *  - Right: Fighters NOT IN tournament
 */

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  backend_uri,
  club_api,
  tournament_fighters_api,
  fighter_api,
} from "../../utility/endpoints";
import { useToast } from "../../utility/ToastProvider";
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

interface TournamentFighterFormProps {
  tournamentId: number;
  tournamentName: string;
}

const TournamentFighterForm: React.FC<TournamentFighterFormProps> = ({
  tournamentId,
  tournamentName,
}) => {
  const addToast = useToast();

  const [inFighters, setInFighters] = useState<FighterUpper[]>([]);
  const [outFighters, setOutFighters] = useState<FighterUpper[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);

  const [searchIn, setSearchIn] = useState("");
  const [searchOut, setSearchOut] = useState("");

  // ---------- Normalizers ----------
  const toUpperFromTF = (f: any, clubById: Map<number, Club>): FighterUpper => {
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

  const toUpperFromAll = (f: any, clubById: Map<number, Club>): FighterUpper => {
    const clubId =
      f.clubId !== undefined && f.clubId !== null ? Number(f.clubId) : null;
    const club = clubId ? clubById.get(clubId) : null;
    return {
      FighterId: f.fighterId ?? f.FighterId,
      FighterName: f.fighterName ?? f.FighterName ?? "",
      ClubId: clubId,
      ClubName: club?.ClubName ?? null,
      ClubAcronym: club?.ClubAcronym ?? null,
    };
  };

  // ---------- Fetchers ----------
  const fetchClubs = useCallback(async () => {
    try {
      const res = await fetch(`${backend_uri}/${club_api}`);
      const data = await res.json();
      if (data.status === "success" && Array.isArray(data.clubs)) {
        setClubs(data.clubs);
      } else {
        addToast(`Error fetching clubs: ${data.message}`);
      }
    } catch (e) {
      console.error("Error fetching clubs", e);
      addToast("Error fetching clubs");
    }
  }, [addToast]);

  const fetchIn = useCallback(async () => {
    try {
      const clubById = new Map<number, Club>(clubs.map((c) => [c.ClubId, c]));
      const res = await fetch(
        `${backend_uri}/${tournament_fighters_api}?tournamentId=${tournamentId}`
      );
      const data = await res.json();
      if (data.status === "success" && Array.isArray(data.fighters)) {
        setInFighters(data.fighters.map((f: any) => toUpperFromTF(f, clubById)));
      } else {
        addToast(`Error loading tournament fighters: ${data.message}`);
      }
    } catch (e) {
      console.error("Error loading tournament fighters", e);
      addToast("Error loading tournament fighters");
    }
  }, [tournamentId, clubs, addToast]);

  const fetchOut = useCallback(async () => {
    try {
      const clubById = new Map<number, Club>(clubs.map((c) => [c.ClubId, c]));

      // 1) ALL fighters
      const resAll = await fetch(`${backend_uri}/${fighter_api}`);
      const dataAll = await resAll.json();
      if (dataAll.status !== "success" || !Array.isArray(dataAll.fighters)) {
        throw new Error(dataAll.message || "Failed to load fighters");
      }
      const allUpper: FighterUpper[] = dataAll.fighters.map((f: any) =>
        toUpperFromAll(f, clubById)
      );

      // 2) IN fighters
      const resIn = await fetch(
        `${backend_uri}/${tournament_fighters_api}?tournamentId=${tournamentId}`
      );
      const dataIn = await resIn.json();
      if (dataIn.status !== "success" || !Array.isArray(dataIn.fighters)) {
        throw new Error(dataIn.message || "Failed to load tournament fighters");
      }
      const inUpper: FighterUpper[] = dataIn.fighters.map((f: any) =>
        toUpperFromTF(f, clubById)
      );

      // 3) OUT = ALL \ IN
      const inIds = new Set(inUpper.map((f) => f.FighterId));
      setOutFighters(allUpper.filter((f) => !inIds.has(f.FighterId)));
    } catch (e) {
      console.error("Error loading non-tournament fighters", e);
      addToast("Error loading non-tournament fighters");
    }
  }, [tournamentId, clubs, addToast]);

  // ---------- Orchestration ----------
  const refreshAll = useCallback(async () => {
    await fetchClubs();
    await fetchIn();
    await fetchOut();
  }, [fetchClubs, fetchIn, fetchOut]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // ---------- Filtering ----------
  const filteredIn = useMemo(() => {
    const q = searchIn.trim().toLowerCase();
    if (!q) return inFighters;
    return inFighters.filter((f) => {
      return (
        (f.FighterName || "").toLowerCase().includes(q) ||
        (f.ClubName || "").toLowerCase().includes(q) ||
        (f.ClubAcronym || "").toLowerCase().includes(q)
      );
    });
  }, [searchIn, inFighters]);

  const filteredOut = useMemo(() => {
    const q = searchOut.trim().toLowerCase();
    if (!q) return outFighters;
    return outFighters.filter((f) => {
      return (
        (f.FighterName || "").toLowerCase().includes(q) ||
        (f.ClubName || "").toLowerCase().includes(q) ||
        (f.ClubAcronym || "").toLowerCase().includes(q)
      );
    });
  }, [searchOut, outFighters]);

  // ---------- Render ----------
  return (
    <div
      className="tournament-fighter-form"
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
    >
      {/* Left Column: IN tournament */}
      <section>
        <h2 style={{ textAlign: "center" }}>In Tournament</h2>
        <input
          type="text"
          placeholder="Search fighters, club names, or acronyms..."
          value={searchIn}
          onChange={(e) => setSearchIn(e.target.value)}
          style={{ marginBottom: "0.75rem", width: "80%" }}
        />
        <div
          className="fighter-list-grid"
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          {filteredIn.map((fighter) => (
            <FighterEntryForm
              key={`in-${fighter.FighterId}`}
              fighter={fighter}
              clubs={clubs}
              tournamentId={tournamentId}
              tournamentName={tournamentName}
              inTournament={true}
              onUpdated={refreshAll}
            />
          ))}
          {!filteredIn.length && <div>No fighters match your search.</div>}
        </div>
      </section>

      {/* Right Column: NOT in tournament */}
      <section>
        <h2 style={{ textAlign: "center" }}>Not In Tournament</h2>
        <input
          type="text"
          placeholder="Search fighters, club names, or acronyms..."
          value={searchOut}
          onChange={(e) => setSearchOut(e.target.value)}
          style={{ marginBottom: "0.75rem", width: "80%" }}
        />
        <div
          className="fighter-list-grid"
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          {filteredOut.map((fighter) => (
            <FighterEntryForm
              key={`out-${fighter.FighterId}`}
              fighter={fighter}
              clubs={clubs}
              tournamentId={tournamentId}
              tournamentName={tournamentName}
              inTournament={false}
              onUpdated={refreshAll}
            />
          ))}
          {!filteredOut.length && <div>No fighters match your search.</div>}
        </div>
      </section>
    </div>
  );
};

export default TournamentFighterForm;

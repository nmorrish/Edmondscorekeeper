/**
 * src/components/Manager/fighterSubComponents/TournamentFighterForm.tsx
 *
 * === Tournament Fighter Form (Primary View) ===
 * Two columns:
 *  - Left: Fighters IN tournament
 *  - Right: Fighters NOT IN tournament
 *
 * Uses optimistic updates + RefreshContext for sync across components.
 */

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  backend_uri,
  club_api,
  tournament_fighters_api,
  fighter_api,
} from "../../utility/endpoints";
import { useToast } from "../../utility/ToastProvider";
import { useRefresh } from "../../utility/RefreshContext";
import FighterEntryForm from "./FighterEntryForm";
import { apiQuery } from "../../utility/apiClient";

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
  const { refreshKey, triggerRefresh } = useRefresh();

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

  // ---------- Load Data ----------
  const loadData = useCallback(async () => {
    try {
      const clubsRes = await apiQuery(`${backend_uri}/${club_api}`);
      const clubsData = await clubsRes.json();
      if (clubsData.status === "success" && Array.isArray(clubsData.clubs)) {
        setClubs(clubsData.clubs);
      }

      const clubById = new Map<number, Club>(
        (clubsData.clubs || []).map((c: Club) => [c.ClubId, c])
      );

      // All fighters
      const allRes = await apiQuery(`${backend_uri}/${fighter_api}`);
      const allData = await allRes.json();
      if (allData.status !== "success" || !Array.isArray(allData.fighters)) {
        throw new Error(allData.message || "Failed to load fighters");
      }
      const allUpper: FighterUpper[] = allData.fighters.map((f: any) =>
        toUpperFromAll(f, clubById)
      );

      // Fighters in tournament
      const inRes = await apiQuery(
        `${backend_uri}/${tournament_fighters_api}?tournamentId=${tournamentId}`
      );
      const inData = await inRes.json();
      if (inData.status !== "success" || !Array.isArray(inData.fighters)) {
        throw new Error(inData.message || "Failed to load tournament fighters");
      }
      const inUpper: FighterUpper[] = inData.fighters.map((f: any) =>
        toUpperFromTF(f, clubById)
      );

      const inIds = new Set(inUpper.map((f) => f.FighterId));
      setInFighters(inUpper);
      setOutFighters(allUpper.filter((f) => !inIds.has(f.FighterId)));
    } catch (err) {
      console.error("Error loading data", err);
      addToast("Error loading fighters");
    }
  }, [tournamentId, addToast]);

  useEffect(() => {
    loadData();
  }, [tournamentId, refreshKey]); // ✅ safe deps

  // ---------- Mutators (Optimistic + triggerRefresh) ----------
  const handleAdd = (fighter: FighterUpper) => {
    setInFighters((prev) => [...prev, fighter]);
    setOutFighters((prev) => prev.filter((f) => f.FighterId !== fighter.FighterId));

    apiQuery(`${backend_uri}/tournamentFightersApi.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId, fighterId: fighter.FighterId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.status !== "success") throw new Error(data.message);
        addToast("Fighter added to tournament");
        triggerRefresh(); // 🔹 notify siblings
      })
      .catch((err) => {
        console.error("Error adding fighter", err);
        addToast("Error adding fighter");
        setOutFighters((prev) => [...prev, fighter]);
        setInFighters((prev) =>
          prev.filter((f) => f.FighterId !== fighter.FighterId)
        );
      });
  };

  const handleRemove = (fighter: FighterUpper) => {
    setOutFighters((prev) => [...prev, fighter]);
    setInFighters((prev) => prev.filter((f) => f.FighterId !== fighter.FighterId));

    apiQuery(
      `${backend_uri}/tournamentFightersApi.php?tournamentId=${tournamentId}&fighterId=${fighter.FighterId}`,
      { method: "DELETE" }
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.status !== "success") throw new Error(data.message);
        addToast("Fighter removed from tournament");
        triggerRefresh(); // 🔹 notify siblings
      })
      .catch((err) => {
        console.error("Error removing fighter", err);
        addToast("Error removing fighter");
        setInFighters((prev) => [...prev, fighter]);
        setOutFighters((prev) =>
          prev.filter((f) => f.FighterId !== fighter.FighterId)
        );
      });
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
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {filteredIn.map((fighter) => (
            <div key={`in-${fighter.FighterId}`} style={{ display: "flex", gap: "0.5rem" }}>
              <FighterEntryForm
                fighter={fighter}
                clubs={clubs}
                tournamentId={tournamentId}
                tournamentName={tournamentName}
                inTournament={true}
                context="tournament"
              />
              <button onClick={() => handleRemove(fighter)} style={{ height: "min-content", marginTop: "16px" }}>Remove →</button>
            </div>
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
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {filteredOut.map((fighter) => (
            <div key={`out-${fighter.FighterId}`} style={{ display: "flex", gap: "0.5rem" }}>
              <button onClick={() => handleAdd(fighter)} style={{ height: "min-content", marginTop: "16px" }}>← Add</button>
              <FighterEntryForm
                fighter={fighter}
                clubs={clubs}
                tournamentId={tournamentId}
                tournamentName={tournamentName}
                inTournament={false}
                context="tournament"
              />
            </div>
          ))}
          {!filteredOut.length && <div>No fighters match your search.</div>}
        </div>
      </section>
    </div>
  );
};

export default TournamentFighterForm;

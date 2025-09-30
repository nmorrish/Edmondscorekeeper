/**
 * src/components/Manager/matchSubComponents/MatchFightersManual.tsx
 */
import React, { useState, useCallback, useMemo, useEffect } from "react";
import { backend_uri, match_fighters_manual_api } from "../../utility/endpoints";
import { useToast } from "../../utility/ToastProvider";
import { Fighter } from "../subComponents/useFighters";
import useMatches, { MatchStatus, Match } from "../subComponents/useMatches";
import MatchCard from "./MatchCard";

interface MatchFightersProps {
  fighters: Fighter[];
  eventId: number;
  maxRings: number;
  isActive: boolean; // NEW
}

const MatchFightersManual: React.FC<MatchFightersProps> = ({
  fighters,
  eventId,
  maxRings,
  // isActive,
}) => {
  const addToast = useToast();

  // NEW: hold isActive in a local variable for potential use
  // const active = isActive;

  const [selectedFighter1, setSelectedFighter1] = useState(
    fighters[0]?.FighterId ?? 0
  );
  const [selectedFighter2, setSelectedFighter2] = useState(
    fighters[1]?.FighterId ?? 0
  );
  const [selectedRing, setSelectedRing] = useState(1);
  const [colorFighter1, setColorFighter1] = useState<"Red" | "Blue">("Red");

  const { matches, loading, error } = useMatches(eventId);

  const [localMatches, setLocalMatches] = useState<Match[]>([]);
  useEffect(() => {
    setLocalMatches(matches);
  }, [matches]);

  if (fighters.length < 2) {
    return <div>Not enough fighters to match.</div>;
  }

  // Handlers for new match form
  const handleFighter1Change = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) =>
      setSelectedFighter1(parseInt(e.target.value)),
    []
  );
  const handleFighter2Change = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) =>
      setSelectedFighter2(parseInt(e.target.value)),
    []
  );
  const handleRingChangeForm = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) =>
      setSelectedRing(parseInt(e.target.value)),
    []
  );
  const handleColorChange = useCallback(
    (color: "Red" | "Blue") => setColorFighter1(color),
    []
  );

  // Filter dropdowns so fighter1 ≠ fighter2
  const filteredFighter1Options = useMemo(
    () => fighters.filter((f) => f.FighterId !== selectedFighter2),
    [fighters, selectedFighter2]
  );
  const filteredFighter2Options = useMemo(
    () => fighters.filter((f) => f.FighterId !== selectedFighter1),
    [fighters, selectedFighter1]
  );

  // Submit new match
  const handleSubmit = async () => {
    const matchData = {
      fighter1: selectedFighter1,
      fighter2: selectedFighter2,
      colorFighter1,
      colorFighter2: colorFighter1 === "Red" ? "Blue" : "Red",
      ring: selectedRing,
      eventId,
    };

    try {
      const response = await fetch(
        `${backend_uri}/${match_fighters_manual_api}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(matchData),
        }
      );
      const data = await response.json();

      if (response.ok && data.status === "success") {
        const fighterInfo1 = fighters.find(
          (f) => f.FighterId === selectedFighter1
        );
        const fighterInfo2 = fighters.find(
          (f) => f.FighterId === selectedFighter2
        );

        const newMatch: Match = {
          MatchId: data.matchId,
          EventId: eventId,
          MatchRingNo: selectedRing,
          PendingActiveDone: "P" as MatchStatus,
          lastMatchJudgement: new Date().toISOString(),
          fighters: [
            {
              FighterId: selectedFighter1,
              FighterName: fighterInfo1?.FighterName ?? "Unknown",
              ClubAcronym: fighterInfo1?.ClubAcronym ?? null,
              FighterColor: colorFighter1,
              FinalScore: 0,
            },
            {
              FighterId: selectedFighter2,
              FighterName: fighterInfo2?.FighterName ?? "Unknown",
              ClubAcronym: fighterInfo2?.ClubAcronym ?? null,
              FighterColor: colorFighter1 === "Red" ? "Blue" : "Red",
              FinalScore: 0,
            },
          ],
        };

        setLocalMatches((prev) => [newMatch, ...prev]);
        addToast("Fighters matched.");
      } else {
        addToast("Match creation error");
      }
    } catch {
      addToast("Failed to submit match data.");
    }
  };

  // Delete handler
  const handleDelete = (matchId: number) => {
    setLocalMatches((prev) => prev.filter((m) => m.MatchId !== matchId));
  };

  // Ring change handler for existing matches
  const handleRingChangeMatch = (matchId: number, newRing: number) => {
    setLocalMatches((prev) =>
      prev.map((m) =>
        m.MatchId === matchId ? { ...m, MatchRingNo: newRing } : m
      )
    );
  };

  return (
    <div className="container" style={{ margin: "0 auto" }}>
      <h2>Manual Fighter Matching</h2>

      {/* Form */}
      <div className="match-form">
        {/* Fighter 1 */}
        <div className="form-group">
          <label>Fighter&nbsp;1:</label>
          <select
            value={selectedFighter1}
            onChange={handleFighter1Change}
            style={{ width: "250px" }}
          >
            {filteredFighter1Options.map((fighter) => (
              <option key={fighter.FighterId} value={fighter.FighterId}>
                {fighter.FighterName}
                {fighter.ClubAcronym ? ` (${fighter.ClubAcronym})` : ""}
              </option>
            ))}
          </select>
          <div className="radio-group">
            <label>
              <input
                type="radio"
                checked={colorFighter1 === "Red"}
                onChange={() => handleColorChange("Red")}
              />
              Red
            </label>
            <label>
              <input
                type="radio"
                checked={colorFighter1 === "Blue"}
                onChange={() => handleColorChange("Blue")}
              />
              Blue
            </label>
          </div>
        </div>

        {/* Fighter 2 */}
        <div className="form-group">
          <label>Fighter 2:</label>
          <select
            value={selectedFighter2}
            onChange={handleFighter2Change}
            style={{ width: "250px" }}
          >
            {filteredFighter2Options.map((fighter) => (
              <option key={fighter.FighterId} value={fighter.FighterId}>
                {fighter.FighterName}
                {fighter.ClubAcronym ? ` (${fighter.ClubAcronym})` : ""}
              </option>
            ))}
          </select>
          <span className="color-label">
            {colorFighter1 === "Red" ? "Blue" : "Red"}
          </span>
        </div>

        {/* Ring */}
        <div className="form-group">
          <label>Ring:</label>
          <select
            value={selectedRing}
            onChange={handleRingChangeForm}
            style={{ width: "250px" }}
          >
            {Array.from({ length: maxRings }, (_, i) => i + 1).map((ring) => (
              <option key={`ring-${ring}`} value={ring}>
                {`Ring ${ring}`}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group full-width">
          <button type="button" onClick={handleSubmit}>
            Submit Match
          </button>
        </div>
      </div>

      {/* Matches grouped by ring */}
      <div style={{ marginTop: "2rem" }}>
        {loading && <p>Loading matches…</p>}
        {error && <p style={{ color: "red" }}>{error}</p>}
        {!loading && localMatches.length === 0 && <p>No matches yet.</p>}

        {Array.from({ length: maxRings }, (_, i) => i + 1).map((ring) => {
          const ringMatches = localMatches.filter(
            (m) => m.MatchRingNo === ring
          );
          if (ringMatches.length === 0) return null;

          return (
            <div key={`ring-${ring}`} style={{ marginBottom: "2rem" }}>
              <h3>Current Matches - Ring {ring}</h3>
              <div className="matches-grid">
                {ringMatches.map((m, idx) => (
                  <MatchCard
                    key={m.MatchId}
                    matchId={m.MatchId}
                    fighters={m.fighters}
                    status={m.PendingActiveDone as MatchStatus}
                    allFighters={fighters}
                    ringNo={m.MatchRingNo}
                    matchNumber={idx + 1}
                    maxRings={maxRings}
                    interactive
                    onDelete={handleDelete}
                    onChangeRing={handleRingChangeMatch}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(MatchFightersManual);

/**
 * src/components/Manager/matchSubComponents/MatchSingleElimEditor.tsx
 *
 * === Single Elimination Viewer/Editor ===
 * Renders bracket rounds using MatchCard for each match.
 * - Portable: consumes backend `BracketRounds` structure.
 * - Editing enabled when `interactive=true`.
 */

import React, { useMemo } from "react";
import MatchCard, { MatchFighterRow, MatchStatus } from "../MatchCard";
import { BracketMatch, BracketRounds } from "./MatchSingleElim";

interface MatchSingleElimEditorProps {
  rounds: BracketRounds;
  maxRings: number;
  interactive?: boolean;
  onChange?: (matchId: number, updatedFighters: MatchFighterRow[]) => void;
  onDelete?: (matchId: number) => void;
  onComplete?: (matchId: number) => void;
  onChangeRing?: (matchId: number, newRing: number) => void;
}

const MatchSingleElimEditor: React.FC<MatchSingleElimEditorProps> = ({
  rounds,
  maxRings,
  interactive = false,
  onChange,
  onDelete,
  onComplete,
  onChangeRing,
}) => {
  // Sort rounds by BracketNo
  const sortedRoundKeys = useMemo(() => {
    const nums = Object.keys(rounds)
      .map((k) => parseInt(k, 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
    return nums;
  }, [rounds]);

  const renderRoundTitle = (roundNo: number) => {
    const finalRoundNo = Math.max(...sortedRoundKeys);
    if (roundNo === finalRoundNo) return "Final";
    return `${roundNo}/${finalRoundNo} Finals`;
  };

  return (
    <div
      className="single-elim-grid"
      style={{
        display: "grid",
        gridAutoFlow: "column",
        gap: 16,
        alignItems: "start",
      }}
    >
      {sortedRoundKeys.map((roundNo) => (
        <div key={roundNo} className="se-column" style={{ minWidth: 280 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            {renderRoundTitle(roundNo)}
          </div>
          {(rounds[String(roundNo)] || []).map((m: BracketMatch, idx: number) => {
            // Convert BracketMatch → MatchCard props
            const fighters: MatchFighterRow[] = (m.fighters || []).map((f, i) => ({
              FighterId: f.fighterId,
              FighterName: f.fighterName ?? `#${f.fighterId}`,
              ClubAcronym: null, // backend doesn’t supply acronym here
              FighterColor: i === 0 ? "Red" : "Blue",
              FinalScore: 0,
            }));

            return (
              <MatchCard
                key={m.matchId}
                matchId={m.matchId}
                fighters={[]}
                status={"P" as MatchStatus} 
                allFighters={[]} 
                ringNo={m.matchRing ?? 1}
                matchNumber={m.matchQueue ?? idx + 1}
                maxRings={maxRings}
                interactive={interactive}
                onChange={onChange}
                onDelete={onDelete}
                onComplete={onComplete}
                onChangeRing={onChangeRing}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default MatchSingleElimEditor;

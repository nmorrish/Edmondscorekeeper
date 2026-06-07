/**
 * src/components/Manager/matchSubComponents/doubleElim/MatchDoubleElimEditor.tsx
 *
 * === Double Elimination Viewer/Editor ===
 * Renders bracket columns using MatchCard, same column style as single elim.
 * - Columns sorted by BracketNo ascending: LB (negative) lands LEFT of the
 *   winners' bracket (positive), grand final(s) on the far right.
 * - Column titles derived from bracketSection + matchRole + round number:
 *     section 'W' (positive)  -> "Winners Round N"
 *     section 'L' (negative)  -> "Losers Round |N|"
 *     role grandFinal/final   -> "Grand Final"
 *     role grandFinalReset    -> "Grand Final (Reset)"
 * - Supports grab-scroll with inertia for large brackets.
 */

import React, { useMemo, useRef, useState } from "react";
import MatchCard, { MatchFighterRow } from "../MatchCard";
import { BracketMatch, BracketRounds } from "./MatchDoubleElim";

interface MatchDoubleElimEditorProps {
  rounds: BracketRounds;
  maxRings: number;
  interactive?: boolean;
  onChange?: (matchId: number, updatedFighters: MatchFighterRow[]) => void;
  onDelete?: (matchId: number) => void;
  onComplete?: (matchId: number) => void;
  onChangeRing?: (matchId: number, newRing: number) => void;
  tournamentId: number;
}

type MatchRole =
  | "final"
  | "bronze"
  | "grandFinal"
  | "grandFinalReset"
  | null
  | undefined;

const roleOf = (m: BracketMatch): MatchRole =>
  (m as BracketMatch & { matchRole?: MatchRole }).matchRole;

const MatchDoubleElimEditor: React.FC<MatchDoubleElimEditorProps> = ({
  rounds,
  maxRings,
  interactive = false,
  onChange,
  onDelete,
  onComplete,
  onChangeRing,
  tournamentId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const velocityRef = useRef(0);
  const lastXRef = useRef(0);
  const animationRef = useRef<number | null>(null);

  // Sort columns by BracketNo ascending.
  // Negative (LB) sort before positive (WB + grand final), so the losers'
  // bracket renders to the LEFT of the winners' bracket.
  const sortedRoundKeys = useMemo(() => {
    const nums = Object.keys(rounds)
      .map((k) => parseInt(k, 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
    return nums;
  }, [rounds]);

  // Resolve a column's role (grand final detection) from its matches.
  const roleByRound = useMemo(() => {
    const map: Record<number, MatchRole> = {};
    for (const roundNo of sortedRoundKeys) {
      const matches = rounds[String(roundNo)] || [];
      const role = matches
        .map(roleOf)
        .find(
          (r) =>
            r === "grandFinal" || r === "grandFinalReset" || r === "final"
        );
      map[roundNo] = role;
    }
    return map;
  }, [rounds, sortedRoundKeys]);

  // Section ('W' | 'L') per column, read from the first match in the column.
  const sectionByRound = useMemo(() => {
    const map: Record<number, "W" | "L" | undefined> = {};
    for (const roundNo of sortedRoundKeys) {
      const matches = rounds[String(roundNo)] || [];
      map[roundNo] = matches[0]?.bracketSection;
    }
    return map;
  }, [rounds, sortedRoundKeys]);

  const renderColumnTitle = (roundNo: number) => {
    const role = roleByRound[roundNo];
    if (role === "grandFinalReset") return "Grand Final (Reset)";
    if (role === "grandFinal" || role === "final") return "Grand Final";

    const section = sectionByRound[roundNo];
    if (section === "L") return `Losers Round ${Math.abs(roundNo)}`;
    // Winners' bracket: BracketNo is the round number directly.
    return `Winners Round ${roundNo}`;
  };

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - containerRef.current.offsetLeft);
    setScrollLeft(containerRef.current.scrollLeft);
    lastXRef.current = e.pageX;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX) * 1;
    containerRef.current.scrollLeft = scrollLeft - walk;

    // Track velocity
    velocityRef.current = e.pageX - lastXRef.current;
    lastXRef.current = e.pageX;
  };

  const stopDragging = () => {
    if (!isDragging) return;
    setIsDragging(false);

    // Start inertia animation
    const inertia = () => {
      if (!containerRef.current) return;
      containerRef.current.scrollLeft -= velocityRef.current;
      velocityRef.current *= 0.95; // friction
      if (Math.abs(velocityRef.current) > 0.5) {
        animationRef.current = requestAnimationFrame(inertia);
      } else {
        animationRef.current = null;
      }
    };
    inertia();
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseLeave={stopDragging}
      onMouseUp={stopDragging}
      onMouseMove={handleMouseMove}
      style={{
        overflowX: "auto",
        overflowY: "hidden",
        maxWidth: "100%",
        paddingBottom: 8,
        cursor: isDragging ? "grabbing" : "grab",
      }}
    >
      <div
        className="double-elim-grid"
        style={{
          display: "grid",
          gridAutoFlow: "column",
          gap: 16,
          alignItems: "start",
          justifyContent: "flex-start",
          minWidth: "fit-content",
          userSelect: "none",
        }}
      >
        {sortedRoundKeys.map((roundNo) => (
          <div key={roundNo} className="de-column" style={{ minWidth: 280 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {renderColumnTitle(roundNo)}
            </div>
            {(rounds[String(roundNo)] || []).map(
              (m: BracketMatch, idx: number) => (
                <MatchCard
                  key={m.matchId}
                  matchId={m.matchId}
                  ringNo={m.matchRing ?? 1}
                  matchNumber={m.matchQueue ?? idx + 1}
                  maxRings={maxRings}
                  interactive={interactive}
                  onChange={onChange}
                  onDelete={onDelete}
                  onComplete={onComplete}
                  onChangeRing={onChangeRing}
                  tournamentId={tournamentId}
                />
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MatchDoubleElimEditor;
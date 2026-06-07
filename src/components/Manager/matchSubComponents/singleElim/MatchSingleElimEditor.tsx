/**
 * src/components/Manager/matchSubComponents/MatchSingleElimEditor.tsx
 *
 * === Single Elimination Viewer/Editor ===
 * Renders bracket rounds using MatchCard for each match.
 * - Portable: consumes backend `BracketRounds` structure.
 * - Editing enabled when `interactive=true`.
 * - Supports grab-scroll with inertia for large brackets.
 * - Column titles are driven by backend `matchRole` ("final" | "bronze"),
 *   not by column position.
 */

import React, { useMemo, useRef, useState } from "react";
import MatchCard, { MatchFighterRow } from "../MatchCard";
import { BracketMatch, BracketRounds } from "./MatchSingleElim";

interface MatchSingleElimEditorProps {
  rounds: BracketRounds;
  maxRings: number;
  interactive?: boolean;
  onChange?: (matchId: number, updatedFighters: MatchFighterRow[]) => void;
  onDelete?: (matchId: number) => void;
  onComplete?: (matchId: number) => void;
  onChangeRing?: (matchId: number, newRing: number) => void;
  tournamentId: number;
}

// Role may not yet be present on the shared BracketMatch interface;
// read it defensively. (Recommended: add `matchRole?: "final" | "bronze" | null`
// to BracketMatch in MatchSingleElim.tsx.)
type MatchRole = "final" | "bronze" | null | undefined;
const roleOf = (m: BracketMatch): MatchRole =>
  (m as BracketMatch & { matchRole?: MatchRole }).matchRole;

const MatchSingleElimEditor: React.FC<MatchSingleElimEditorProps> = ({
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

  // Sort rounds by BracketNo
  const sortedRoundKeys = useMemo(() => {
    const nums = Object.keys(rounds)
      .map((k) => parseInt(k, 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
    return nums;
  }, [rounds]);

  // Map each column (BracketNo) to its role, derived from the matches it holds.
  const roleByRound = useMemo(() => {
    const map: Record<number, MatchRole> = {};
    for (const roundNo of sortedRoundKeys) {
      const matches = rounds[String(roundNo)] || [];
      // A bronze/final column holds a single match; pick the first role found.
      const role = matches.map(roleOf).find((r) => r === "final" || r === "bronze");
      map[roundNo] = role;
    }
    return map;
  }, [rounds, sortedRoundKeys]);

  // Number of "real" rounds = columns that are neither bronze nor final.
  const realRoundCount = useMemo(
    () =>
      sortedRoundKeys.filter(
        (rn) => roleByRound[rn] !== "final" && roleByRound[rn] !== "bronze"
      ).length,
    [sortedRoundKeys, roleByRound]
  );

  const renderRoundTitle = (roundNo: number) => {
    const role = roleByRound[roundNo];
    if (role === "final") return "Gold | Silver";
    if (role === "bronze") return "Bronze";

    // Real round: position among the real rounds only.
    const realIndex =
      sortedRoundKeys
        .filter((rn) => roleByRound[rn] !== "final" && roleByRound[rn] !== "bronze")
        .indexOf(roundNo) + 1;

    return `Round ${realIndex}/${realRoundCount}`;
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
        className="single-elim-grid"
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
          <div key={roundNo} className="se-column" style={{ minWidth: 280 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {renderRoundTitle(roundNo)}
            </div>
            {(rounds[String(roundNo)] || []).map((m: BracketMatch, idx: number) => (
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
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MatchSingleElimEditor;
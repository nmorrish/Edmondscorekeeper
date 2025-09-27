/**
 * src/components/utility/TotalsCalculator.tsx
 * 
 * == Totals Calculator ==
 * Calculates per-exchange averages + overall totals for a fighter:
 *   - Judge count per exchange
 *   - Average for each scoring criterion
 *   - Column totals
 *   - Grand total
 */

import React, { useEffect, useMemo, useRef } from "react";

/** Individual score structure */
export interface Score {
  scoreId: number;
  judgeName: string;
  contact: boolean;
  target: boolean;
  control: boolean;
  afterBlow: boolean;
  opponentSelfCall: boolean;
  doubleHit: boolean;
}

/** Exchange structure */
export interface Exchange {
  exchangeId: number;
  exchangeTimeStamp: string;
  scores: Score[];
}

/** Fighter structure */
export interface Fighter {
  fighterId: number;
  fighterName: string;
  fighterColor: string;
  exchanges: Exchange[];
}

/** Props */
interface TotalsCalculatorProps {
  fighter: Fighter;
  onTotalsCalculated: (totals: any) => void;
}

/** Utility: deep compare to prevent unnecessary updates */
const areTotalsEqual = (prevTotals: any, newTotals: any) =>
  JSON.stringify(prevTotals) === JSON.stringify(newTotals);

const TotalsCalculator: React.FC<TotalsCalculatorProps> = ({ fighter, onTotalsCalculated }) => {
  const totals = useMemo(() => {
    const exchangeAverages = (fighter.exchanges || []).map((ex) => {
      const scores = ex.scores || [];
      const count = scores.length;

      if (count === 0) {
        return {
          judgeCount: 0,
          avgContact: 0,
          avgTarget: 0,
          avgControl: 0,
          avgAfterBlow: 0,
          avgSelfCall: 0,
          avgDoubleHit: 0,
        };
      }

      const sum = scores.reduce(
        (acc, s) => {
          acc.contact += s.contact ? 1 : 0;
          acc.target += s.target ? 1 : 0;
          acc.control += s.control ? 1 : 0;
          acc.afterBlow += s.afterBlow ? 1 : 0;
          acc.opponentSelfCall += s.opponentSelfCall ? 1 : 0;
          acc.doubleHit += s.doubleHit ? 1 : 0;
          return acc;
        },
        { contact: 0, target: 0, control: 0, afterBlow: 0, opponentSelfCall: 0, doubleHit: 0 }
      );

      return {
        judgeCount: count,
        avgContact: sum.contact / count,
        avgTarget: sum.target / count,
        avgControl: sum.control / count,
        avgAfterBlow: sum.afterBlow / count,
        avgSelfCall: sum.opponentSelfCall / count,
        avgDoubleHit: sum.doubleHit / count,
      };
    });

    // Totals across all exchanges
    const overallTotals = exchangeAverages.reduce(
      (acc, row) => {
        acc.contact += row.avgContact;
        acc.target += row.avgTarget;
        acc.control += row.avgControl;
        acc.afterBlow += row.avgAfterBlow;
        acc.opponentSelfCall += row.avgSelfCall;
        acc.doubleHit += row.avgDoubleHit;
        return acc;
      },
      { contact: 0, target: 0, control: 0, afterBlow: 0, opponentSelfCall: 0, doubleHit: 0 }
    );

    const grandTotal = (
      overallTotals.contact +
      overallTotals.target +
      overallTotals.control +
      overallTotals.afterBlow +
      overallTotals.opponentSelfCall
    ).toFixed(2);

    return { exchangeAverages, overallTotals, grandTotal };
  }, [fighter.exchanges]);

  const previousTotals = useRef<any>(null);

  useEffect(() => {
    if (!areTotalsEqual(previousTotals.current, totals)) {
      previousTotals.current = totals;
      onTotalsCalculated(totals);
    }
  }, [totals, onTotalsCalculated]);

  return null;
};

export default TotalsCalculator;

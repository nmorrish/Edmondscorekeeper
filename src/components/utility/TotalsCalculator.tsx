import React, { useEffect, useMemo } from 'react';

// Define the Score interface
interface Score {
  scoreId: number;
  target: number;
  contact: number;
  control: number;
  afterBlow: number;
  opponentSelfCall: number;
  doubleHit: boolean;
}

// Define the Fighter interface
interface Fighter {
  fighterColor: string;
  fighterName: string;
  Bouts: Score[][]; // Bouts contain arrays of scores
}

// Define the props interface for TotalsCalculator component
interface TotalsCalculatorProps {
  fighter: Fighter;
  onTotalsCalculated: (totals: any) => void;
}

// Utility function for deep comparison of totals to prevent unnecessary updates
const areTotalsEqual = (prevTotals: any, newTotals: any) => {
  return JSON.stringify(prevTotals) === JSON.stringify(newTotals);
};

const TotalsCalculator: React.FC<TotalsCalculatorProps> = ({ fighter, onTotalsCalculated }) => {
  // Calculate the averages only when `fighter.Bouts` changes
  const totals = useMemo(() => {
    const calculateAverages = (scores: Score[]) => {
      if (scores.length === 0) {
        return {
          avgContact: 0,
          avgTarget: 0,
          avgControl: 0,
          avgAfterBlow: 0,
          avgSelfCall: 0,
          avgDoubleHit: 0,
          judgeCount: 0,
        };
      }

      // Sum up all the scores
      const totals = scores.reduce(
        (acc, score) => {
          acc.contact += score.contact;
          acc.target += score.target;
          acc.control += score.control;
          acc.afterBlow += score.afterBlow;
          acc.opponentSelfCall += score.opponentSelfCall;
          acc.doubleHit += score.doubleHit ? 1 : 0;
          return acc;
        },
        { contact: 0, target: 0, control: 0, afterBlow: 0, opponentSelfCall: 0, doubleHit: 0 }
      );

      const count = scores.length;

      return {
        avgContact: totals.contact / count,
        avgTarget: totals.target / count,
        avgControl: totals.control / count,
        avgAfterBlow: totals.afterBlow / count,
        avgSelfCall: totals.opponentSelfCall / count,
        avgDoubleHit: totals.doubleHit / count,
        judgeCount: count,
      };
    };

    // Calculate averages for each bout
    const boutTotals = fighter.Bouts.map(boutScores => calculateAverages(boutScores));

    // Calculate overall totals across all bouts
    const overallTotals = boutTotals.reduce(
      (acc, averages) => {
        acc.contact += averages.avgContact;
        acc.target += averages.avgTarget;
        acc.control += averages.avgControl;
        acc.afterBlow += averages.avgAfterBlow;
        acc.opponentSelfCall += averages.avgSelfCall;
        acc.doubleHit += averages.avgDoubleHit;
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

    return { boutTotals, overallTotals, grandTotal };
  }, [fighter.Bouts]);

  // Store the previous totals to compare against the new totals
  let previousTotals = React.useRef<any>(null);

  useEffect(() => {
    // Only call the callback if totals have changed
    if (!areTotalsEqual(previousTotals.current, totals)) {
      previousTotals.current = totals; // Update the previous totals
      onTotalsCalculated(totals);      // Call the callback with new totals
    }
  }, [totals, onTotalsCalculated]);

  return null; // This component doesn't render anything
};

export default TotalsCalculator;

/**
 * src/components/utility/TotalsCalculator.tsx
 * 
 * == Totals Calculator ==
 * This will calculate and return for a single fighter:
 *   -The total for each scoring criteria earned by the fighter for a single exchange/bout.
 *   -The number of judges that submitted a score for that fighter.
 *   -The grand total of that fighter for the match.
 * 
 * Totals returned as arrays. 
 * The `useMemo` feature is used to avoid recalculating existing values. 
 * The `useEffect` feature is used to notify parent components when totals change
 * The `areTotalsEqual` utility function is used to avoid unnecessary updates
 * 
 */

import React, { useEffect, useMemo } from 'react';


/** Individual score structure */
interface Score {
  scoreId: number;
  target: number;
  contact: number;
  control: number;
  afterBlow: number;
  opponentSelfCall: number;
  doubleHit: boolean;
}


/** Fighter structure */
interface Fighter {
  fighterColor: string;
  fighterName: string;
  Bouts: Score[][]; // Bouts contain arrays of scores
}


/** Defines the props expected by the TotalsCalculator component */
interface TotalsCalculatorProps {
  fighter: Fighter;
  onTotalsCalculated: (totals: any) => void;
}


/**
 * Utility function for deep comparison of totals to prevent unnecessary updates.
 * Since the JSON containing totals is organized by bout, comparing the entire JSON ensures 
 * that only bouts that are new will be included in the recalculation of overall score. 
 * 
 * @param {any} prevTotals - Previous totals object
 * @param {any} newTotals - New totals object
 * @returns {boolean} True if the totals are the same, otherwise false
 */
const areTotalsEqual = (prevTotals: any, newTotals: any) => {
  return JSON.stringify(prevTotals) === JSON.stringify(newTotals);
};


/**
 * TotalsCalculator component.
 *
 * This component computes the average scores for a single fighter's bouts and provides
 * the calculated totals to a parent component via `onTotalsCalculated`.
 *
 * @param {TotalsCalculatorProps} props - The component props
 * @returns {null} This component does not render any UI
 */
const TotalsCalculator: React.FC<TotalsCalculatorProps> = ({ fighter, onTotalsCalculated }) => {

  /** Calculate the averages only when `fighter.Bouts` changes*/
  const totals = useMemo(() => {

    /**
     * Calculates the average values for a given set of scores.
     *
     * @param {Score[]} scores - The scores to process
     * @returns {object} The computed averages
     */
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

      // Sum up all the scores, return as array
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

    // Compute grand total score as a string with two decimal places
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

  /** Triggers the `onTotalsCalculated` callback only if totals have changed. */
  useEffect(() => {
    if (!areTotalsEqual(previousTotals.current, totals)) {
      previousTotals.current = totals; // Update the previous totals
      onTotalsCalculated(totals);      // Call the callback with new totals
    }
  }, [totals, onTotalsCalculated]);

  return null; // This component doesn't render anything
};

export default TotalsCalculator;

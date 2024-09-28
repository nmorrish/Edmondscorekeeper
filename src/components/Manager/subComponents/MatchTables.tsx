import React, { useState, useEffect, useCallback } from "react";
import TriggerJudgement from "./TriggerJudgement";
import { useRefresh } from "../../utility/RefreshContext";
import { domain_uri } from "../../utility/contants";
import ScoreDisplayComponent from "./ScoreDisplayComponent";
import TotalsCalculator from '../../utility/TotalsCalculator';

interface Score {
  scoreId: number;
  target: number;
  contact: number;
  control: number;
  afterBlow: number;
  opponentSelfCall: number;
  doubleHit: boolean;
}

interface Bout {
  boutId: number;
  fighter1: {
    fighterColor: string;
    fighterName: string;
    Scores: Score[];
  };
  fighter2: {
    fighterColor: string;
    fighterName: string;
    Scores: Score[];
  };
}

interface Match {
  matchId: number;
  matchRing: number;
  Bouts: Bout[];
}

const MatchTables: React.FC = () => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [visibleMatches, setVisibleMatches] = useState<Record<number, boolean>>({});
  const [fighter1GrandTotals, setFighter1GrandTotals] = useState<Record<number, string>>({});
  const [fighter2GrandTotals, setFighter2GrandTotals] = useState<Record<number, string>>({});
  const { refreshKey } = useRefresh();

  const fetchMatches = useCallback(async () => {
    try {
      const response = await fetch(`${domain_uri}/listMatches.php`);
      const data = await response.json();
      console.log("Fetched data:", data);

      if (Array.isArray(data)) {
        setMatches(data);
      } else {
        console.error("Unexpected data format, expected an array:", data);
        setMatches([]);
      }
    } catch (error) {
      console.error("Error fetching matches:", error);
    }
  }, []);

  const connectToSSE = useCallback(() => {
    const eventSource = new EventSource(`${domain_uri}/updateJudgementSSE.php`);

    eventSource.onmessage = (event) => {
      if (event.data) {
        try {
          const data = JSON.parse(event.data);
          if (data === null) {
            console.log("Initial connection established.");
          } else {
            console.log("Bout_Score update detected:", data);
            if (data.status === "Match updated") {
              fetchMatches();
            }
          }
        } catch (error) {
          console.error("Error parsing SSE data:", error);
        }
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      eventSource.close();
      setTimeout(() => {
        console.log("Reconnecting to SSE...");
        connectToSSE();
      }, 5000);
    };

    return eventSource;
  }, [fetchMatches]);

  useEffect(() => {
    const eventSource = connectToSSE();
    return () => {
      eventSource.close();
    };
  }, [connectToSSE]);

  useEffect(() => {
    const storedVisibility = localStorage.getItem("visibleMatches");
    if (storedVisibility) {
      setVisibleMatches(JSON.parse(storedVisibility));
    }
    fetchMatches();
  }, [refreshKey, fetchMatches]);

  useEffect(() => {
    localStorage.setItem("visibleMatches", JSON.stringify(visibleMatches));
  }, [visibleMatches]);

  const toggleVisibility = (matchId: number) => {
    setVisibleMatches((prev) => ({
      ...prev,
      [matchId]: !prev[matchId],
    }));
  };

  const handleTotalsCalculatedForFighter1 = useCallback(
    (matchId: number, totals: { grandTotal: string }) => {
      setFighter1GrandTotals((prev) => {
        if (prev[matchId] !== totals.grandTotal) {
          return { ...prev, [matchId]: totals.grandTotal };
        }
        return prev;
      });
    },
    []
  );

  const handleTotalsCalculatedForFighter2 = useCallback(
    (matchId: number, totals: { grandTotal: string }) => {
      setFighter2GrandTotals((prev) => {
        if (prev[matchId] !== totals.grandTotal) {
          return { ...prev, [matchId]: totals.grandTotal };
        }
        return prev;
      });
    },
    []
  );

  // Determine which fighter to highlight based on non-zero grand total
  const getHighlightClass = (fighter1Total: number, fighter2Total: number, isFighter1: boolean) => {
    if (fighter1Total > fighter2Total && fighter1Total > 0 && isFighter1) {
      return "highlight"; // Apply highlight class to fighter1
    } else if (fighter2Total > fighter1Total && fighter2Total > 0 && !isFighter1) {
      return "highlight"; // Apply highlight class to fighter2
    }
    return ""; // No class if no highlight is needed
  };

  return (
    <div>
      {Array.isArray(matches) && matches.length > 0 ? (
        matches.map((match) => {
          if (!match.Bouts || match.Bouts.length === 0) return null;

          const fighter1Bouts = match.Bouts.map((bout) => bout.fighter1.Scores);
          const fighter2Bouts = match.Bouts.map((bout) => bout.fighter2.Scores);

          const fighter1 = {
            fighterColor: match.Bouts[0].fighter1.fighterColor,
            fighterName: match.Bouts[0].fighter1.fighterName,
            Bouts: fighter1Bouts,
          };

          const fighter2 = {
            fighterColor: match.Bouts[0].fighter2.fighterColor,
            fighterName: match.Bouts[0].fighter2.fighterName,
            Bouts: fighter2Bouts,
          };

          const fighter1GrandTotal = parseFloat(fighter1GrandTotals[match.matchId] || '0.00');
          const fighter2GrandTotal = parseFloat(fighter2GrandTotals[match.matchId] || '0.00');

          return (
            <div key={match.matchId} className="match-table">
              <input type="hidden" value={match.matchId} />

              <TotalsCalculator
                fighter={fighter1}
                onTotalsCalculated={(totals) => handleTotalsCalculatedForFighter1(match.matchId, totals)}
              />
              <TotalsCalculator
                fighter={fighter2}
                onTotalsCalculated={(totals) => handleTotalsCalculatedForFighter2(match.matchId, totals)}
              />

              <div className="table-header">
                <h2>
                  <span className={getHighlightClass(fighter1GrandTotal, fighter2GrandTotal, true)}>
                    {fighter1.fighterName} ({fighter1GrandTotal.toFixed(2)})
                  </span>{" "}
                  vs.{" "}
                  <span className={getHighlightClass(fighter1GrandTotal, fighter2GrandTotal, false)}>
                    {fighter2.fighterName} ({fighter2GrandTotal.toFixed(2)})
                  </span>
                </h2>
                <button className="toggle-button" onClick={() => toggleVisibility(match.matchId)}>
                  {visibleMatches[match.matchId] ? "Close" : "Open"}
                </button>
              </div>

              {visibleMatches[match.matchId] && (
                <>
                  <div className="scoreTables">
                    <ScoreDisplayComponent fighter={fighter1} />
                    <ScoreDisplayComponent fighter={fighter2} />
                  </div>

                  <TriggerJudgement matchId={match.matchId} refresh={false} />
                  <TriggerJudgement matchId={match.matchId} refresh={true} />
                </>
              )}
            </div>
          );
        })
      ) : (
        <div>No matches available.</div>
      )}
    </div>
  );
};

export default MatchTables;

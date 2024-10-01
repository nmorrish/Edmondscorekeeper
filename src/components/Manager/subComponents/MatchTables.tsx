import React, { useState, useEffect, useCallback } from "react";
import TriggerJudgement from "./TriggerJudgement";
import { useRefresh } from "../../utility/RefreshContext";
import { domain_uri } from "../../utility/contants";
import ScoreDisplayComponent from "./ScoreDisplayComponent";
import FighterSelector from "./FighterSelector";
import TotalsCalculator from '../../utility/TotalsCalculator';
import { useToast } from '../../utility/ToastProvider';
import SetActiveMatchButton from "./setActiveMatch";
import SetCompleteMatchButton from "./setMatchToComplete";

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
    fighterId: number;
    Scores: Score[];
  };
  fighter2: {
    fighterColor: string;
    fighterName: string;
    fighterId: number;
    Scores: Score[];
  };
}

interface Match {
  matchId: number;
  matchRing: number;
  Bouts: Bout[];
  Active: boolean;
  matchComplete: boolean;
}

const MatchTables: React.FC = () => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [visibleMatches, setVisibleMatches] = useState<Record<number, boolean>>({});
  const [fighter1GrandTotals, setFighter1GrandTotals] = useState<Record<number, string>>({});
  const [fighter2GrandTotals, setFighter2GrandTotals] = useState<Record<number, string>>({});
  const { refreshKey, triggerRefresh } = useRefresh(); 
  const addToast = useToast();

  const fetchMatches = useCallback(async () => {
    try {
      const response = await fetch(`${domain_uri}/listMatches.php`);
      const data = await response.json();
      console.log("Fetched Matches Data:", data); // Add this log to check fetched data
      if (Array.isArray(data)) {
        setMatches(data);
      } else {
        console.error("Data is not in expected format:", data);
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
          if (data && data.status === "Match updated") {
            fetchMatches();
            addToast("Score update detected");
          }
        } catch (error) {
          console.error("Error parsing SSE data:", error);
        }
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      eventSource.close();
      setTimeout(() => connectToSSE(), 5000);
    };

    return eventSource;
  }, [fetchMatches]);

  useEffect(() => {
    const eventSource = connectToSSE();
    return () => eventSource.close();
  }, [connectToSSE]);

  useEffect(() => {
    console.log("Refresh key triggered:", refreshKey); // Add logging to verify refresh
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
      setFighter1GrandTotals((prev) => ({
        ...prev,
        [matchId]: totals.grandTotal,
      }));
    },
    []
  );

  const handleTotalsCalculatedForFighter2 = useCallback(
    (matchId: number, totals: { grandTotal: string }) => {
      setFighter2GrandTotals((prev) => ({
        ...prev,
        [matchId]: totals.grandTotal,
      }));
    },
    []
  );

  const handleFighterUpdate = (matchId: number, fighterNumber: "fighter1" | "fighter2", fighterId: number, fighterName: string, fighterColor: string) => {
    setMatches((prevMatches) => 
      prevMatches.map((match) => 
        match.matchId === matchId 
        ? {
            ...match,
            Bouts: match.Bouts.map((bout) => ({
              ...bout,
              [fighterNumber]: {
                ...bout[fighterNumber],
                fighterId,
                fighterName,
                fighterColor,
              }
            })),
          } 
        : match
      )
    );
    triggerRefresh(); // Trigger refresh when fighter is updated
  };

  const getHighlightClass = (fighter1Total: number, fighter2Total: number, isFighter1: boolean) => {
    if (fighter1Total > fighter2Total && fighter1Total > 0 && isFighter1) {
      return "highlight";
    } else if (fighter2Total > fighter1Total && fighter2Total > 0 && !isFighter1) {
      return "highlight";
    }
    return "";
  };

  const getMatchTableClass = (active: boolean, matchComplete: boolean) => {
    if (active) {
      return "match-table active-match";
    } else if (matchComplete) {
      return "match-table completed-match";
    } else {
      return "match-table";
    }
  };

  return (
    <div>
      {matches.length > 0 ? (
        matches.map((match) => {
          if (!match.Bouts || match.Bouts.length === 0) return null;

          const fighter1Bouts = match.Bouts.map((bout) => bout.fighter1.Scores);
          const fighter2Bouts = match.Bouts.map((bout) => bout.fighter2.Scores);

          const fighter1 = {
            fighterColor: match.Bouts[0].fighter1.fighterColor,
            fighterName: match.Bouts[0].fighter1.fighterName,
            fighterId: match.Bouts[0].fighter1.fighterId,
            matchId: match.matchId,
            Bouts: fighter1Bouts,
          };

          const fighter2 = {
            fighterColor: match.Bouts[0].fighter2.fighterColor,
            fighterName: match.Bouts[0].fighter2.fighterName,
            fighterId: match.Bouts[0].fighter2.fighterId,
            matchId: match.matchId,
            Bouts: fighter2Bouts,
          };

          const fighter1GrandTotal = parseFloat(fighter1GrandTotals[match.matchId] || "0.00");
          const fighter2GrandTotal = parseFloat(fighter2GrandTotals[match.matchId] || "0.00");

          return (
            <div key={match.matchId} className={getMatchTableClass(match.Active, match.matchComplete)}>
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
                  ({fighter1GrandTotal.toFixed(2)})
                  <FighterSelector
                      currentFighterId={fighter1.fighterId}
                      currentFighterColor={fighter1.fighterColor}
                      matchId={match.matchId}
                      fighterNumber="fighter1"
                      onUpdate={(fighterId, fighterName, fighterColor) =>
                        handleFighterUpdate(match.matchId, "fighter1", fighterId, fighterName, fighterColor)
                      }
                    /> 
                  </span>{" "}
                  vs.{" "}
                  <span className={getHighlightClass(fighter1GrandTotal, fighter2GrandTotal, false)}>
                  <FighterSelector
                      currentFighterId={fighter2.fighterId}
                      currentFighterColor={fighter2.fighterColor}
                      matchId={match.matchId}
                      fighterNumber="fighter2"
                      onUpdate={(fighterId, fighterName, fighterColor) =>
                        handleFighterUpdate(match.matchId, "fighter2", fighterId, fighterName, fighterColor)
                      }
                    /> ({fighter2GrandTotal.toFixed(2)})
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
                  <span style={{ display: 'flex', justifyContent:'center' }}>
                    <SetActiveMatchButton matchId={match.matchId} />
                    <SetCompleteMatchButton matchId={match.matchId} />
                  </span>
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

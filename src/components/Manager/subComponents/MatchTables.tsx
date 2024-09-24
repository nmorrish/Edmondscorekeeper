import React, { useState, useEffect, useCallback } from "react";
import TriggerJudgement from "./TriggerJudgement";
import { useRefresh } from "../../utility/RefreshContext";
import { domain_uri } from "../../utility/contants";
import ScoreDisplayComponent from "./ScoreDisplayComponent";

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

  return (
    <div>
      {Array.isArray(matches) && matches.length > 0 ? (
        matches.map((match) => {
          if (!match.Bouts || match.Bouts.length === 0) return null;

          // For each bout, get the fighter1 and fighter2 scores and pass them to ScoreDisplayComponent
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

          return (
            <div key={match.matchId} className="match-table">
              <input type="hidden" value={match.matchId} />

              <div className="table-header">
                <h2>
                  {fighter1.fighterName} vs. {fighter2.fighterName}
                </h2>
                <button className="toggle-button" onClick={() => toggleVisibility(match.matchId)}>
                  {visibleMatches[match.matchId] ? "Close" : "Open"}
                </button>
              </div>

              {visibleMatches[match.matchId] && (
                <>
                  {/* Pass the bouts for each fighter to the ScoreDisplayComponent */}
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

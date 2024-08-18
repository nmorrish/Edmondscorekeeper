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
  fighterColor: string;
  fighterId: number;
  fighterName: string;
  Scores: Score[];
}

interface Match {
  matchId: number;
  matchRing: number;
  Bouts: Record<string, Bout>;
}

const MatchTables: React.FC = () => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [visibleMatches, setVisibleMatches] = useState<Record<number, boolean>>({});
  const { refreshKey } = useRefresh();

  const fetchMatches = useCallback(async () => {
    try {
      const response = await fetch(`${domain_uri}/listMatches.php`);
      const data: Match[] = await response.json();
      setMatches(data); // Update the state with new data
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
              fetchMatches(); // Fetch the updated matches
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
      // Attempt to reconnect after a delay
      setTimeout(() => {
        console.log("Reconnecting to SSE...");
        connectToSSE();
      }, 5000); // Reconnect after 5 seconds
    };

    return eventSource;
  }, [fetchMatches]);

  useEffect(() => {
    // Connect to SSE when the component mounts
    const eventSource = connectToSSE();

    return () => {
      // Cleanup on component unmount
      eventSource.close();
    };
  }, [connectToSSE]);

  useEffect(() => {
    const storedVisibility = localStorage.getItem("visibleMatches");
    if (storedVisibility) {
      setVisibleMatches(JSON.parse(storedVisibility));
    }

    fetchMatches(); // Trigger data fetch on component mount
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
      {matches.map((match) => {
        const boutEntries = Object.values(match.Bouts);
        if (boutEntries.length < 2) return null;

        const [fighter1, fighter2] = boutEntries;

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
                <div className="fighter-table">
                  <ScoreDisplayComponent fighter={fighter1} />
                  <ScoreDisplayComponent fighter={fighter2} />
                </div>
                <TriggerJudgement matchId={match.matchId} refresh={false} />
                <TriggerJudgement matchId={match.matchId} refresh={true} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MatchTables;

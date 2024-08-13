import React, { useState, useEffect } from "react";
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

  useEffect(() => {
    const storedVisibility = localStorage.getItem("visibleMatches");
    if (storedVisibility) {
      setVisibleMatches(JSON.parse(storedVisibility));
    }

    fetchMatches();
  }, [refreshKey]);

  useEffect(() => {
    const eventSource = new EventSource(`${ domain_uri }/updateJudgementSSE.php`);

    eventSource.onmessage = (event) => {
      if (event.data) {
        try {
          const data = JSON.parse(event.data);
          console.log("Bout_Score update detected:", data);

          if (data.status === "Bout_Score updated") {
            fetchMatches();
          }
        } catch (error) {
          console.error("Error parsing SSE data:", error);
        }
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const fetchMatches = async () => {
    try {
      const response = await fetch(`${ domain_uri }/listMatches.php`);
      const data: Match[] = await response.json();
      setMatches(data);
    } catch (error) {
      console.error("Error fetching matches:", error);
    }
  };

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
                <ScoreDisplayComponent fighter={fighter1} />
                <ScoreDisplayComponent fighter={fighter2} />
                <TriggerJudgement matchId={match.matchId} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MatchTables;

import React, { useState, useEffect } from "react";
import TriggerJudgement from "../Judgement/TriggerJudgement";
import { useRefresh } from "../RefreshContext";
import { domain_uri } from "../contants";

interface Score {
  scoreId: number;
  target: number;
  contact: number;
  control: number;
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
    // Load the visibility state from localStorage when the component mounts
    const storedVisibility = localStorage.getItem("visibleMatches");
    if (storedVisibility) {
      setVisibleMatches(JSON.parse(storedVisibility));
    }

    fetchMatches();
  }, [refreshKey]);

  useEffect(() => {
    const eventSource = new EventSource(`${domain_uri}/updateJudgementSSE.php`);

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

    // Cleanup on component unmount
    return () => {
      eventSource.close();
    };
  }, []);

  const fetchMatches = async () => {
    try {
      const response = await fetch(`${domain_uri}/listMatches.php`);
      const data: Match[] = await response.json();

      setMatches(data);
    } catch (error) {
      console.error("Error fetching matches:", error);
    }
  };

  useEffect(() => {
    // Save the visibility state to localStorage whenever it changes
    localStorage.setItem("visibleMatches", JSON.stringify(visibleMatches));
  }, [visibleMatches]);

  const toggleVisibility = (matchId: number) => {
    setVisibleMatches((prev) => ({
      ...prev,
      [matchId]: !prev[matchId],
    }));
  };

  const calculateSum = (scores: Score[]) => {
    const totalScores = scores.reduce(
      (totals, score) => {
        return {
          contact: totals.contact + score.contact,
          target: totals.target + score.target,
          control: totals.control + score.control,
        };
      },
      { contact: 0, target: 0, control: 0 }
    );

    return {
      sumContact: totalScores.contact,
      sumTarget: totalScores.target,
      sumControl: totalScores.control,
      total: totalScores.contact + totalScores.target + totalScores.control,
    };
  };

  return (
    <div>
      {matches.map((match) => {
        const boutEntries = Object.values(match.Bouts);
        if (boutEntries.length < 2) return null;

        const [fighter1, fighter2] = boutEntries;

        const sum1 = calculateSum(fighter1.Scores);
        const sum2 = calculateSum(fighter2.Scores);

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
                <table className="match">
                  <thead>
                    <tr>
                      <th colSpan={3} className={fighter1.fighterColor}>
                        {fighter1.fighterName} ({fighter1.fighterColor})
                      </th>
                      <th colSpan={3} className={fighter2.fighterColor}>
                        {fighter2.fighterName} ({fighter2.fighterColor})
                      </th>
                    </tr>
                    <tr>
                      <th className={fighter1.fighterColor}>Contact</th>
                      <th className={fighter1.fighterColor}>Target</th>
                      <th className={fighter1.fighterColor}>Control</th>
                      <th className={fighter2.fighterColor}>Contact</th>
                      <th className={fighter2.fighterColor}>Target</th>
                      <th className={fighter2.fighterColor}>Control</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({
                      length: Math.max(fighter1.Scores.length, fighter2.Scores.length),
                    }).map((_, index) => {
                      const score1 =
                        fighter1.Scores[index] || { contact: "", target: "", control: "" };
                      const score2 =
                        fighter2.Scores[index] || { contact: "", target: "", control: "" };

                      return (
                        <tr key={index}>
                          <td>{score1.contact}</td>
                          <td>{score1.target}</td>
                          <td>{score1.control}</td>
                          <td>{score2.contact}</td>
                          <td>{score2.target}</td>
                          <td>{score2.control}</td>
                        </tr>
                      );
                    })}

                    <tr className="average-row">
                      <td>{sum1.sumContact.toFixed(0)}</td>
                      <td>{sum1.sumTarget.toFixed(0)}</td>
                      <td>{sum1.sumControl.toFixed(0)}</td>
                      <td>{sum2.sumContact.toFixed(0)}</td>
                      <td>{sum2.sumTarget.toFixed(0)}</td>
                      <td>{sum2.sumControl.toFixed(0)}</td>
                    </tr>

                    <tr className="total-row">
                      <td colSpan={3}>Total: {sum1.total.toFixed(0)}</td>
                      <td colSpan={3}>Total: {sum2.total.toFixed(0)}</td>
                    </tr>
                  </tbody>
                </table>

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

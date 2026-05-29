import React, { useState, useEffect } from "react";
import { backend_uri } from "../../utility/endpoints";
import { useToast } from "../../utility/ToastProvider";
import { apiQuery } from "../../utility/apiClient";

interface JudgeScoresProps {
  fighterId: number;
  exchanges: Array<{
    exchangeId?: number;
    ExchangeId?: number;
    exchangeTimeStamp?: string | null;
    scores: Array<{
      scoreId: number;
      judgeName: string;
      contact: boolean;
      target: boolean;
      control: boolean;
      afterBlow: boolean;
      doubleHit: boolean;
      opponentSelfCall: boolean;
    }>;
  }>;
  readOnly: boolean;
  onExchangesUpdate?: (updated: JudgeScoresProps["exchanges"]) => void;
  indexOffset?: number;
}

const JudgeScores: React.FC<JudgeScoresProps> = ({
  exchanges,
  readOnly,
  onExchangesUpdate,
  indexOffset = 0,
}) => {
  const addToast = useToast();
  const [localExchanges, setLocalExchanges] = useState(exchanges);

  // --- keep in sync with parent/SSE updates ---
  useEffect(() => {
    setLocalExchanges(exchanges);
  }, [exchanges]);

  // only used when not readonly
  const handleToggle = async (
    scoreId: number,
    field: keyof Omit<
      JudgeScoresProps["exchanges"][0]["scores"][0],
      "scoreId" | "judgeName"
    >,
    currentValue: boolean
  ) => {
    if (readOnly) return;

    const updated = localExchanges.map((ex) => ({
      ...ex,
      scores: ex.scores.map((s) =>
        s.scoreId === scoreId ? { ...s, [field]: !currentValue } : s
      ),
    }));
    setLocalExchanges(updated);
    if (onExchangesUpdate) onExchangesUpdate(updated);

    try {
      const resp = await apiQuery(`${backend_uri}/updateJudgeScore.php`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scoreId, field, value: currentValue ? 0 : 1 }),
      });
      const data = await resp.json();

      if (data.status === "success") {
        addToast(`Updated ${field} for JudgeScore ${scoreId}`);
      } else {
        addToast(`Update failed: ${data.message}`);
      }
    } catch {
      addToast("Network error updating score");
    }
  };

  const calcExchangeTotals = (scores: JudgeScoresProps["exchanges"][0]["scores"]) => {
    const n = scores.length || 1;
    return {
      contact: scores.reduce((a, s) => a + (s.contact ? 1 : 0), 0) / n,
      target: scores.reduce((a, s) => a + (s.target ? 1 : 0), 0) / n,
      control: scores.reduce((a, s) => a + (s.control ? 1 : 0), 0) / n,
      afterBlow: scores.reduce((a, s) => a + (s.afterBlow ? 1 : 0), 0) / n,
      opponentSelfCall: scores.reduce((a, s) => a + (s.opponentSelfCall ? 1 : 0), 0) / n,
      doubleHit: scores.reduce((a, s) => a + (s.doubleHit ? 1 : 0), 0) / n,
    };
  };

  return (
    <div className="judge-scores-editor">
      {localExchanges.map((ex, exIdx) => {
        const exchangeId = ex.exchangeId ?? ex.ExchangeId ?? exIdx;
        const totals = calcExchangeTotals(ex.scores);

        return (
          <div key={`exchange-${exchangeId}`} style={{ marginBottom: "15px" }}>
            <h4 style={{fontSize : "1.6em", margin : 0}}>Exchange {exIdx + 1 + indexOffset}</h4>
            <table className="judge-scores-table">
              <thead>
                <tr>
                  <th>Judge</th>
                  <th>CONT</th>
                  <th>TRGT</th>
                  <th>CTRL</th>
                  <th>A/B</th>
                  <th>Call</th>
                  <th>DBL</th>
                </tr>
              </thead>
              <tbody>
                {ex.scores.map((s) => (
                  <tr key={`score-${s.scoreId}`}>
                    <td>{s.judgeName}</td>
                    {[
                      "contact",
                      "target",
                      "control",
                      "afterBlow",
                      "opponentSelfCall",
                      "doubleHit",
                    ].map((field) => (
                      <td key={`${s.scoreId}-${field}`}>
                        {readOnly ? (
                          // --- readonly mode: show styled span instead of disabled checkbox ---
                          <span
                            className={
                              s[field as keyof typeof s]
                                ? "checkbox-sim checked"
                                : "checkbox-sim"
                            }
                          >
                            {s[field as keyof typeof s] ? "✓" : ""}
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={Boolean(s[field as keyof typeof s])}
                            onChange={() =>
                              handleToggle(
                                s.scoreId,
                                field as any,
                                Boolean(s[field as keyof typeof s])
                              )
                            }
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}

                <tr className="exchange-totals">
                  <td>Ave</td>
                  <td>{totals.contact.toFixed(1)}</td>
                  <td>{totals.target.toFixed(1)}</td>
                  <td>{totals.control.toFixed(1)}</td>
                  <td>{totals.afterBlow.toFixed(1)}</td>
                  <td>{totals.opponentSelfCall.toFixed(1)}</td>
                  <td>({totals.doubleHit.toFixed(1)})</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};

export default JudgeScores;

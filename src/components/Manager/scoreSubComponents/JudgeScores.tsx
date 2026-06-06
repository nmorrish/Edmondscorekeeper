import React, { useState, useEffect } from "react";
import { backend_uri } from "../../utility/endpoints";
import { useToast } from "../../utility/ToastProvider";
import { apiQuery } from "../../utility/apiClient";

interface ScoreData {
  scoreId: number;
  judgeName: string;
  contact: boolean;
  target: boolean;
  control: boolean;
  afterBlow: boolean;
  doubleHit: boolean;
  opponentSelfCall: boolean;
  contactUncertainty?: boolean;
  targetUncertainty?: boolean;
  controlUncertainty?: boolean;
  doubleHitUncertainty?: boolean;
  afterBlowUncertainty?: boolean;
}

interface JudgeScoresProps {
  fighterId: number;
  exchanges: Array<{
    exchangeId?: number;
    ExchangeId?: number;
    exchangeTimeStamp?: string | null;
    scores: Array<ScoreData>;
  }>;
  readOnly: boolean;
  onExchangesUpdate?: (updated: JudgeScoresProps["exchanges"]) => void;
  indexOffset?: number;
  fighterColor?: string;
}

// ── Criterion cell ────────────────────────────────────────────────────────────
// Readonly: plain ✓ span, no uncertainty display.
// Editable + uncertain: amber ? occluder (top) + red × (bottom), both clear flag.
// Editable + not uncertain: checkbox only, no ? button (uncertainty can't be added here).

const SLOT = 28;
const GAP  = 6;
const BTN  = SLOT - 6;

interface ReviewCriterionCellProps {
  checked: boolean;
  uncertain: boolean;
  readOnly: boolean;
  onToggle: () => void;
  onClearUncertainty: () => void;
}

const ReviewCriterionCell: React.FC<ReviewCriterionCellProps> = ({
  checked, uncertain, readOnly, onToggle, onClearUncertainty,
}) => {
  if (readOnly) {
    return (
      <td>
        <span className={checked ? "checkbox-sim checked" : "checkbox-sim"}>
          {checked ? "✓" : ""}
        </span>
      </td>
    );
  }

  return (
    <td style={{ verticalAlign: 'top', padding: '4px' }}>
      <style>{`
        @keyframes reviewFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* Top slot: ? occluder when uncertain, checkbox when not */}
      <div style={{ height: SLOT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {uncertain ? (
          <button
            onClick={onClearUncertainty}
            title="Clear uncertainty"
            style={{
              width: 25, height: 25,
              transform: 'scale(1.5)',
              fontSize: '0.8rem', fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid #d97706',
              borderRadius: 4,
              background: '#f59e0b',
              color: '#000',
              padding: 0, lineHeight: 1,
              animation: 'reviewFadeIn 0.15s ease',
            }}
          >?</button>
        ) : (
          <input type="checkbox" checked={checked} onChange={onToggle} />
        )}
      </div>

      {/* Bottom slot: × when uncertain, empty placeholder when not (keeps row height consistent) */}
      <div style={{ height: SLOT, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: GAP }}>
        {uncertain ? (
          <button
            onClick={onClearUncertainty}
            title="Clear uncertainty"
            style={{
              width: BTN, height: BTN,
              fontSize: '0.9rem',
              cursor: 'pointer',
              border: '1px solid rgba(220,60,60,0.9)',
              borderRadius: 4,
              background: 'rgba(200,40,40,0.75)',
              color: '#fff',
              padding: 0, lineHeight: 1,
              animation: 'reviewFadeIn 0.15s ease',
            }}
          >×</button>
        ) : (
          <div style={{ width: BTN, height: BTN }} />
        )}
      </div>
    </td>
  );
};

// ── Criteria displayed in the table ──────────────────────────────────────────
const REVIEW_CRITERIA = [
  { key: 'contact'  as const, uncertaintyKey: 'contactUncertainty'   as const, label: 'CONT' },
  { key: 'target'   as const, uncertaintyKey: 'targetUncertainty'    as const, label: 'TRGT' },
  { key: 'control'  as const, uncertaintyKey: 'controlUncertainty'   as const, label: 'CTRL' },
  { key: 'doubleHit'as const, uncertaintyKey: 'doubleHitUncertainty' as const, label: 'DBL'  },
];

// ── Component ─────────────────────────────────────────────────────────────────

const JudgeScores: React.FC<JudgeScoresProps> = ({
  exchanges,
  readOnly,
  onExchangesUpdate,
  indexOffset = 0,
  fighterColor,
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
    field: keyof Omit<ScoreData, "scoreId" | "judgeName">,
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

  const calcExchangeTotals = (scores: ScoreData[]) => {
    const n = scores.length || 1;
    return {
      contact:          scores.reduce((a, s) => a + (s.contact ? 1 : 0), 0) / n,
      target:           scores.reduce((a, s) => a + (s.target ? 1 : 0), 0) / n,
      control:          scores.reduce((a, s) => a + (s.control ? 1 : 0), 0) / n,
      afterBlow:        scores.reduce((a, s) => a + (s.afterBlow ? 1 : 0), 0) / n,
      opponentSelfCall: scores.reduce((a, s) => a + (s.opponentSelfCall ? 1 : 0), 0) / n,
      doubleHit:        scores.reduce((a, s) => a + (s.doubleHit ? 1 : 0), 0) / n,
    };
  };

  return (
    <div className={`judge-scores-editor${fighterColor ? ` scores-${fighterColor}` : ""}`}>
      {localExchanges.map((ex, exIdx) => {
        const exchangeId = ex.exchangeId ?? ex.ExchangeId ?? exIdx;
        const totals = calcExchangeTotals(ex.scores);

        return (
          <div key={`exchange-${exchangeId}`} style={{ marginBottom: "15px" }}>
            <h4 style={{ fontSize: "1.6em", margin: 0 }}>Exchange {exIdx + 1 + indexOffset}</h4>
            <table className="judge-scores-table">
              <thead>
                <tr>
                  <th>Judge</th>
                  {REVIEW_CRITERIA.map(c => <th key={c.key}>{c.label}</th>)}
                  {/* <th>A/B</th>
                  <th>Call</th> */}
                </tr>
              </thead>
              <tbody>
                {ex.scores.map((s) => (
                  <tr key={`score-${s.scoreId}`}>
                    <td>{s.judgeName}</td>
                    {REVIEW_CRITERIA.map((c) => (
                      <ReviewCriterionCell
                        key={`${s.scoreId}-${c.key}`}
                        checked={Boolean(s[c.key])}
                        uncertain={Boolean(s[c.uncertaintyKey])}
                        readOnly={readOnly}
                        onToggle={() => handleToggle(s.scoreId, c.key, Boolean(s[c.key]))}
                        onClearUncertainty={() => handleToggle(s.scoreId, c.uncertaintyKey, true)}
                      />
                    ))}
                  </tr>
                ))}

                <tr className="exchange-totals">
                  <td>Ave</td>
                  <td>{totals.contact.toFixed(1)}</td>
                  <td>{totals.target.toFixed(1)}</td>
                  <td>{totals.control.toFixed(1)}</td>
                  {/* <td>{totals.afterBlow.toFixed(1)}</td>
                  <td>{totals.opponentSelfCall.toFixed(1)}</td> */}
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
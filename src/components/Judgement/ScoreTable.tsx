/**
 * src/components/Judgement/ScoreTable.tsx
 * 
 * This displays the table judges use to Pass Judgement on a bout.
 *
 * Table displays fighter's name and color. 
 * Has checkboxes for Contact, Target, Control.
 * Has buttons for AfterBlows and Self-calls.
 * 
 * For ease of formatting, duplicate code reduction, and conformance to database structure, 
 * one table will be rendered for each fighter (2 tables rendered per exchange).
 */
import React, { useCallback, useState } from 'react';

interface Fighter {
  fighterId: number;
  fighterName: string;
  fighterColor: string;
}

interface ScoreTableProps {
  fighter: Fighter;
  opponent: Fighter;
  scores: Record<string, boolean>;
  onCheckboxChange: (fighterId: number, criteria: string) => void;
  onSubmit: (action: { fighterId?: number; opponentId?: number; doubleHit?: boolean }) => void;
  onConfirm: (message: string, action: () => void) => void;
}

const SLOT = 28;
const GAP  = 6;
const BTN  = SLOT - 6;

interface CriterionCellProps {
  name: string;
  checked: boolean;
  uncertain: boolean;
  onCheck: () => void;
  onUncertainActivate: () => void;
  onUncertainDeactivate: () => void;
}

const CriterionCell: React.FC<CriterionCellProps> = ({
  name, checked, uncertain, onCheck, onUncertainActivate, onUncertainDeactivate,
}) => (
  <td style={{ verticalAlign: 'top', padding: '4px' }}>
    <style>{`
      @keyframes criterionFadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
    `}</style>

    {/* Top slot: checkbox normally, ? occluder when uncertain */}
    <div style={{ height: SLOT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {uncertain ? (
        <button
          onClick={onUncertainDeactivate}
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
            animation: 'criterionFadeIn 0.15s ease',
          }}
        >?</button>
      ) : (
        <input type="checkbox" name={name} checked={checked} onChange={onCheck} />
      )}
    </div>

    {/* Bottom slot: small ? normally, × when uncertain */}
    <div style={{ height: SLOT, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: GAP }}>
      {uncertain ? (
        <button
          onClick={onUncertainDeactivate}
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
            animation: 'criterionFadeIn 0.15s ease',
          }}
        >×</button>
      ) : (
        <button
          onClick={onUncertainActivate}
          title="Flag uncertainty"
          style={{
            width: BTN, height: BTN,
            fontSize: '0.7rem', fontWeight: 700,
            cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.35)',
            borderRadius: 4,
            background: 'rgba(255,255,255,0.18)',
            color: '#fff',
            padding: 0, lineHeight: 1,
            animation: 'criterionFadeIn 0.15s ease',
          }}
        >?</button>
      )}
    </div>

  </td>
);

const CRITERIA = [
  { key: 'contact', label: 'Contact' },
  { key: 'target',  label: 'Target'  },
  { key: 'control', label: 'Control' },
] as const;

const ScoreTable: React.FC<ScoreTableProps> = ({
  fighter,
  opponent,
  scores,
  onCheckboxChange,
  // onSubmit,
  // onConfirm,
}) => {
  // Tracks whether each criterion was already checked before ? was tapped.
  // Determines whether × restores score to checked or unchecked.
  const [preUncertain, setPreUncertain] = useState<Record<string, boolean>>({});

  const handleCheckboxChange = useCallback(
    (criteria: string) => {
      // always clear opponent when scoring this fighter
      onCheckboxChange(opponent.fighterId, 'clear');

      if (criteria === 'target' || criteria === 'control') {
        // if target/control is checked, force contact true
        if (!scores.contact) {
          onCheckboxChange(fighter.fighterId, 'contact');
        }
        onCheckboxChange(fighter.fighterId, criteria);
      } else if (criteria === 'contact') {
        // toggling contact: if unchecking it, also clear target/control
        if (scores.contact) {
          // currently true → going false, so clear dependent boxes
          onCheckboxChange(fighter.fighterId, 'contact'); // uncheck contact
          if (scores.target)  onCheckboxChange(fighter.fighterId, 'target');
          if (scores.control) onCheckboxChange(fighter.fighterId, 'control');
        } else {
          // just check contact normally
          onCheckboxChange(fighter.fighterId, 'contact');
        }
      } else {
        // normal behavior for afterBlow/opponentSelfCall etc.
        onCheckboxChange(fighter.fighterId, criteria);
      }
    },
    [fighter.fighterId, opponent.fighterId, onCheckboxChange, scores]
  );

  // const handleAfterBlowSubmit = useCallback(
  //   () => onConfirm('Confirm Afterblow?', () => onSubmit({ fighterId: fighter.fighterId, doubleHit: false })),
  //   [fighter.fighterId, onConfirm, onSubmit]
  // );

  // const handleSelfCallSubmit = useCallback(
  //   () => onConfirm('Confirm Self-call?', () => onSubmit({ opponentId: opponent.fighterId, doubleHit: false })),
  //   [opponent.fighterId, onConfirm, onSubmit]
  // );

  const handleUncertaintyActivate = useCallback((criteria: string) => {
    setPreUncertain(prev => ({ ...prev, [criteria]: scores[criteria] || false }));
    if (!scores[criteria]) {
      // Checks score, handles cascade, clears opponent
      handleCheckboxChange(criteria);
    } else {
      // Score already checked; just clear opponent (uncertainty is still a scoring action)
      onCheckboxChange(opponent.fighterId, 'clear');
    }
    onCheckboxChange(fighter.fighterId, `${criteria}Uncertainty`);
  }, [scores, fighter.fighterId, opponent.fighterId, handleCheckboxChange, onCheckboxChange]);

  const handleUncertaintyDeactivate = useCallback((criteria: string) => {
    const wasChecked = preUncertain[criteria] ?? false;

    // Remove uncertainty flag (toggle true→false; only called when uncertain is true)
    onCheckboxChange(fighter.fighterId, `${criteria}Uncertainty`);

    if (!wasChecked && scores[criteria]) {
      // Score was not checked before ? was tapped — uncheck it and run cascade
      handleCheckboxChange(criteria);
      // If contact cascaded away target/control, clear their uncertainty flags too
      if (criteria === 'contact') {
        if (scores.target  && scores.targetUncertainty) {
          onCheckboxChange(fighter.fighterId, 'targetUncertainty');
          setPreUncertain(prev => { const n = { ...prev }; delete n.target; return n; });
        }
        if (scores.control && scores.controlUncertainty) {
          onCheckboxChange(fighter.fighterId, 'controlUncertainty');
          setPreUncertain(prev => { const n = { ...prev }; delete n.control; return n; });
        }
      }
    }

    setPreUncertain(prev => { const n = { ...prev }; delete n[criteria]; return n; });
  }, [preUncertain, scores, fighter.fighterId, handleCheckboxChange, onCheckboxChange]);

  return (
    <div className={`${fighter.fighterColor}`}>
      <table className="match">
        <thead>
          <tr>
            <th colSpan={3}>
              {fighter.fighterName} ({fighter.fighterColor})
            </th>
          </tr>
          <tr>
            {CRITERIA.map(c => <th key={c.key}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            {CRITERIA.map(c => (
              <CriterionCell
                key={c.key}
                name={`${c.key}-${fighter.fighterId}`}
                checked={scores[c.key] || false}
                uncertain={scores[`${c.key}Uncertainty`] || false}
                onCheck={() => handleCheckboxChange(c.key)}
                onUncertainActivate={() => handleUncertaintyActivate(c.key)}
                onUncertainDeactivate={() => handleUncertaintyDeactivate(c.key)}
              />
            ))}
          </tr>
        </tbody>
      </table>

      {/* <input
        type="button"
        className="scoreButton"
        name={`afterblow-${fighter.fighterId}`}
        value={`afterblow: ${fighter.fighterColor} hit first`}
        onClick={handleAfterBlowSubmit}
      /> *
      <input
        type="button"
        className="scoreButton"
        name={`selfCall-${fighter.fighterId}`}
        value={`self-call: ${fighter.fighterColor} point concede`}
        onClick={handleSelfCallSubmit}
      /> */}
    </div>
  );
};

export default React.memo(ScoreTable);
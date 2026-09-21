/**
 * src/components/Manager/scoreSubComponents/FighterCards.tsx
 *
 * === Fighter Cards ===
 * Replaces the old strike system. Shows three severity chips (Yellow/Red/Black),
 * each with a count of cards the fighter holds at that severity. Clicking any chip
 * opens a modal listing the fighter's card history and (when not readOnly) an
 * issue flow: pick severity, pick an offense via radio, issue.
 *
 * Cards are read from props (fed by scoresApi). Issuing POSTs to fighterCardsApi
 * and calls triggerRefresh() so the parent repulls. Offenses are fetched lazily
 * on first modal open.
 */

import React, { useState, useCallback } from "react";
import { backend_uri, card_api } from "../../utility/endpoints";
import { apiQuery } from "../../utility/apiClient";
import { useToast } from "../../utility/ToastProvider";
import { useRefresh } from "../../utility/RefreshContext";

export interface FighterCard {
  fighterCardId: number;
  cardableOffenseId: number;
  offenseName: string;
  severity: "Yellow" | "Red" | "Black";
  reason: string | null;
  issuedAt: string;
}

interface Offense {
  cardableOffenseId: number;
  offenseName: string;
  offenseDescription: string | null;
}

interface FighterCardsProps {
  fighterId: number;
  fighterName: string;
  tournamentId: number;
  cards: FighterCard[];
  readOnly: boolean;
}

type Severity = "Yellow" | "Red" | "Black";
const SEVERITIES: Severity[] = ["Yellow", "Red", "Black"];
const SEVERITY_COLORS: Record<Severity, string> = {
  Yellow: "#e0b400",
  Red: "#c0281f",
  Black: "#222",
};

const FighterCards: React.FC<FighterCardsProps> = ({
  fighterId,
  fighterName,
  tournamentId,
  cards,
  readOnly,
}) => {
  const [open, setOpen] = useState(false);
  const [offenses, setOffenses] = useState<Offense[]>([]);
  const [issuingSeverity, setIssuingSeverity] = useState<Severity | null>(null);
  const [selectedOffenseId, setSelectedOffenseId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const addToast = useToast();
  const { triggerRefresh } = useRefresh();

  const countBySeverity = (s: Severity) => cards.filter((c) => c.severity === s).length;

  const loadOffenses = useCallback(async () => {
    if (offenses.length > 0) return;
    try {
      const resp = await apiQuery(`${backend_uri}/${card_api}?resource=offenses`);
      const data = await resp.json();
      if (data?.status === "success" && Array.isArray(data.offenses)) {
        setOffenses(data.offenses);
      }
    } catch (err) {
      console.error("Error loading offenses:", err);
    }
  }, [offenses.length]);

  const handleOpen = () => {
    setOpen(true);
    if (!readOnly) loadOffenses();
  };

  const handleClose = () => {
    setOpen(false);
    setIssuingSeverity(null);
    setSelectedOffenseId(null);
  };

  const startIssue = (severity: Severity) => {
    setIssuingSeverity(severity);
    setSelectedOffenseId(null);
  };

  const issueCard = async () => {
    if (!issuingSeverity || selectedOffenseId == null) return;
    setSubmitting(true);
    try {
      const resp = await apiQuery(`${backend_uri}/${card_api}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId,
          fighterId,
          cardableOffenseId: selectedOffenseId,
          severity: issuingSeverity,
        }),
      });
      const data = await resp.json();
      if (data?.status === "success") {
        addToast(`${issuingSeverity} card issued to ${fighterName}`);
        setIssuingSeverity(null);
        setSelectedOffenseId(null);
        triggerRefresh();
      } else {
        addToast(`Error: ${data?.message || "Failed to issue card"}`);
      }
    } catch (err) {
      console.error("Error issuing card:", err);
      addToast("Error issuing card");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
        <div style={{ display: "flex", gap: "6px", justifyContent: "center", marginTop: "4px" }}>   
            {SEVERITIES.map((s) => (
                <button
                key={s}
                type="button"
                onClick={handleOpen}
                title={`${s} cards`}
                style={{
                    backgroundColor: SEVERITY_COLORS[s],
                    color: s === "Yellow" ? "#000" : "#fff",
                    width: "22px",
                    height: "30px",
                    padding: 0,
                    margin: 0,
                    borderRadius: "3px",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
                >
                {countBySeverity(s)}
                </button>
            ))}
        </div>

      {open && (
        <div className="modal-backdrop" onClick={handleClose}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-nav-row">
              <span className="modal-nav-label">{fighterName} — Cards</span>
              <button className="review-close-btn" onClick={handleClose}>×</button>
            </div>

            <div style={{ padding: "12px 16px", overflowY: "auto" }}>
              {/* Card history */}
              {cards.length === 0 ? (
                <p style={{ color: "#aaa" }}>No cards issued.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {cards.map((c) => (
                    <li
                      key={c.fighterCardId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "6px 0",
                        borderBottom: "1px solid #333",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          width: "14px",
                          height: "14px",
                          borderRadius: "3px",
                          backgroundColor: SEVERITY_COLORS[c.severity],
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ flex: 1 }}>{c.offenseName}</span>
                      <span style={{ fontSize: "0.75rem", color: "#888" }}>{c.issuedAt}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Issue flow */}
              {!readOnly && (
                <div style={{ marginTop: "16px" }}>
                  {!issuingSeverity ? (
                    <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                      {SEVERITIES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => startIssue(s)}
                          style={{ backgroundColor: SEVERITY_COLORS[s], color: s === "Yellow" ? "#000" : "#fff" }}
                        >
                          Add {s}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontWeight: 600, marginBottom: "8px" }}>
                        Issue {issuingSeverity} card — select offense:
                      </p>
                      {offenses.length === 0 ? (
                        <p style={{ color: "#aaa" }}>No offenses in catalog.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" }}>
                          {offenses.map((o) => (
                            <label key={o.cardableOffenseId} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <input
                                type="radio"
                                name="offense"
                                checked={selectedOffenseId === o.cardableOffenseId}
                                onChange={() => setSelectedOffenseId(o.cardableOffenseId)}
                              />
                              {o.offenseName}
                            </label>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "12px" }}>
                        <button className="btn-neutral" type="button" onClick={() => setIssuingSeverity(null)}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={selectedOffenseId == null || submitting}
                          onClick={issueCard}
                        >
                          Issue Card
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FighterCards;
/**
 * src/components/utility/FloatingNav.tsx
 *
 * Floating Navigation with styled header/footer
 */

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { backend_uri } from "../utility/endpoints";
import { apiQuery } from "./apiClient";

interface FloatingNavProps {
  tournamentId: number;
  links: { text: string; to: string }[];
  backUrl: string; // new prop for "Back to tournaments"
}

const FloatingNav: React.FC<FloatingNavProps> = ({ tournamentId, links, backUrl }) => {
  const [open, setOpen] = useState(false);
  const [tournamentName, setTournamentName] = useState<string>("");

  useEffect(() => {
    if (!tournamentId) return;

    const fetchTournamentName = async () => {
      try {
        const res = await apiQuery(`${backend_uri}/tournamentApi.php?id=${tournamentId}`);
        const data = await res.json();
        if (data.status === "success" && data.tournament) {
          setTournamentName(data.tournament.TournamentName);
        } else {
          setTournamentName("Tournament");
        }
      } catch (err) {
        console.error("Failed to fetch tournament:", err);
        setTournamentName("Tournament");
      }
    };

    fetchTournamentName();
  }, [tournamentId]);

  return (
    <div className="floating-nav">
      {/* Toggle Button */}
      <button onClick={() => setOpen(!open)} className="floating-nav__button">
        {open ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="floating-nav__icon" viewBox="0 0 24 24">
            <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="floating-nav__icon" viewBox="0 0 24 24">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        )}
      </button>

      {/* Menu */}
      {open && (
        <div className="floating-nav__menu">
          {/* Header */}
          <div className="floating-nav__header">
            <h3>{tournamentName}</h3>
          </div>

          {/* Links */}
          <ul className="floating-nav__list">
            {links.map((link, idx) => (
              <li key={idx}>
                <Link to={link.to} onClick={() => setOpen(false)}>
                  {link.text}
                </Link>
              </li>
            ))}
          </ul>

          {/* Footer (Back to tournaments) */}
          <div className="floating-nav__footer">
            <Link to={backUrl} onClick={() => setOpen(false)}>
                <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                >
                <path d="M15 18l-6-6 6-6" />
                </svg>
                select tournament
            </Link>
            </div>
        </div>
      )}
    </div>
  );
};

export default FloatingNav;

import React, { useEffect, useState, useCallback } from "react";
import { backend_uri, event_fighters_api } from "../../../utility/endpoints";
import { Fighter } from "../../subComponents/useFighters";
import { useToast } from "../../../utility/ToastProvider";
import { sanitizeFighters } from "../../../utility/dataGuards";
import MatchSingleElimFighterManager from "./MatchSingleElimFighterManager";
import { apiQuery } from "../../../utility/apiClient";

interface Props {
  eventId: number;
  tournamentId: number;
  showManage?: boolean;
}

const EVENT_FIGHTERS_API = `${backend_uri}/${event_fighters_api}`;

const MatchSingleElimFighterList: React.FC<Props> = ({
  eventId,
  tournamentId,
  showManage = true,
}) => {
  const addToast = useToast();
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [showManager, setShowManager] = useState(false);

  const loadFighters = useCallback(async () => {
    try {
      const res = await apiQuery(`${EVENT_FIGHTERS_API}?eventId=${eventId}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.status === "success" && Array.isArray(data.fighters)) {
        setFighters(sanitizeFighters(data.fighters));
      } else {
        setFighters([]);
      }
    } catch (err: any) {
      addToast(`Error fetching fighters: ${err.message || err}`);
    }
  }, [eventId, addToast]);

  useEffect(() => {
    loadFighters();
  }, [loadFighters]);

  return (
    <div>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 6,
      }}>
        <span style={{ fontWeight: 600 }}>{fighters.length} Fighters in Event</span>
        {showManage && (
          <button
            onClick={() => setShowManager(true)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #666",
              background: "#1b1b1b",
              cursor: "pointer",
            }}
          >
            Manage Fighters
          </button>
        )}
      </div>

      {fighters.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No fighters found for this event.</div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 8,
        }}>
          {fighters.map((f) => (
            <div
              key={String(f.FighterId)}
              style={{
                border: "1px solid #444",
                borderRadius: 8,
                padding: 8,
              }}
            >
              <div style={{ fontWeight: 600 }}>{f.FighterName}</div>
              {f.ClubName && (
                <div style={{ opacity: 0.75, fontSize: 12 }}>{f.ClubName}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {showManager && (
        <MatchSingleElimFighterManager
          eventId={eventId}
          tournamentId={tournamentId}
          onClose={() => setShowManager(false)}
        />
      )}
    </div>
  );
};

export default MatchSingleElimFighterList;

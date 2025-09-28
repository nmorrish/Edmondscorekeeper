/**
 * src/components/Manager/fighterSubComponents/FighterList.tsx
 *
 * == Fighter List ==
 * Lists each fighter in the selected event and their strikes.
 * If no fighters exist, links scorekeeper to the fighter-matching page.
 */
import React, { memo } from "react";
import { Fighter } from "../subComponents/useFighters";

interface FighterListProps {
  fighters: Fighter[];
  eventId: number;
}

const TournamentFighterList: React.FC<FighterListProps> = ({ fighters, eventId }) => {
  if (!fighters || fighters.length === 0) {
    return (
      <a href={`/manager/fighters/${eventId}`}>
        Click here to add fighters to this tournament
      </a>
    );
  }

  return (
    <div>
      <h2>Fighters in tournament</h2>
      <table className="fighter-table">
        <tbody>
          {fighters.map((fighter) => (
            <tr key={fighter.FighterId}>
              <td>
                {fighter.FighterName}{" "}
                {fighter.ClubAcronym == null ? "" : `(${fighter.ClubAcronym})`}
              </td>
              <td>{fighter.Strikes ?? 0} Strikes</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default memo(TournamentFighterList);

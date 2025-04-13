/**
 * src/components/Manager/subComponents/FighterList.tsx
 * 
 * == Fighter List ==
 * 
 * Lists each fighter in the tournament and their strikes.
 * Does not show which rings fighters are in.
 */
import React, { memo } from "react";

interface Fighter {
  fighterId: number;
  fighterName: string;
  strikes: number;
}

interface FighterListProps {
  fighters: Fighter[];
}

const FighterList: React.FC<FighterListProps> = ({ fighters }) => {
  if (!fighters.length) {
    return <div>Please add fighters</div>;
  }

  return (
    <div>
      <h2>Fighters List</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Strikes</th>
          </tr>
        </thead>
        <tbody>
          {fighters.map((fighter) => (
            <tr key={fighter.fighterId}>
              <td>{fighter.fighterName}</td>
              <td>{fighter.strikes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Memoize the FighterList component to avoid unnecessary re-renders
export default memo(FighterList);

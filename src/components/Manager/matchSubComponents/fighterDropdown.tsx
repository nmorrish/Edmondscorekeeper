// src/components/Manager/subComponents/FighterDropdown.tsx

import React from "react";
import { Fighter } from "../subComponents/useFighters";
import { MatchFighterRow } from "./MatchCard";

interface FighterDropdownProps {
  fighter: MatchFighterRow;
  allFighters: Fighter[];
  localFighters: MatchFighterRow[];
  onUpdate: (fighterColor: string, fighterId: number) => void;
  interactive: boolean;
}

const FighterDropdown: React.FC<FighterDropdownProps> = ({
  fighter,
  allFighters,
  localFighters,
  onUpdate,
  interactive,
}) => {
  if (!interactive) {
    return (
      <span>
        {fighter.FighterName}{" "}
        {fighter.ClubAcronym ? `(${fighter.ClubAcronym})` : ""}
      </span>
    );
  }

  return (
    <select
      className="fighter-dropdown"
      value={fighter.FighterId}
      onChange={(e) => onUpdate(fighter.FighterColor, parseInt(e.target.value))}
    >
      {allFighters
        // filter out fighter chosen in the *other* dropdown
        .filter(
          (af) =>
            !localFighters.some(
              (other) =>
                other.FighterColor !== fighter.FighterColor &&
                other.FighterId === af.FighterId
            )
        )
        .map((af) => (
          <option key={af.FighterId} value={af.FighterId}>
            {af.FighterName} {af.ClubAcronym ? `(${af.ClubAcronym})` : ""}
          </option>
        ))}
    </select>
  );
};

export default FighterDropdown;

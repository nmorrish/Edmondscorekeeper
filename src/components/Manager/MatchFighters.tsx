// MatchFighters.tsx
import React, { useState } from "react";
import { useRefresh } from "../utility/RefreshContext"; // Import the refresh hook
import {domain_uri} from '../utility/contants';

interface Fighter {
  fighterId: number;
  fighterName: string;
  strikes: number;
}

interface MatchFightersProps {
  fighters: Fighter[];
}

const MatchFighters: React.FC<MatchFightersProps> = ({ fighters }) => {
  const { triggerRefresh } = useRefresh(); // Use refresh context

  if (fighters.length < 2) {
    return <div>Not enough fighters to match.</div>;
  }

  const [selectedFighter1, setSelectedFighter1] = useState(fighters[0].fighterId);
  const [selectedFighter2, setSelectedFighter2] = useState(fighters[1].fighterId);
  const [selectedRing, setSelectedRing] = useState(1);
  const [colorFighter1, setColorFighter1] = useState("Red"); // Default first fighter to Red

  const handleFighter1Change = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedFighter1(parseInt(event.target.value));
  };

  const handleFighter2Change = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedFighter2(parseInt(event.target.value));
  };

  const handleRingChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedRing(parseInt(event.target.value));
  };

  const handleColorChange = (color: string) => {
    // Toggle colors between fighters
    setColorFighter1(color);
  };

  const handleSubmit = async () => {
    const matchData = {
      fighter1: selectedFighter1,
      fighter2: selectedFighter2,
      colorFighter1: colorFighter1,
      colorFighter2: colorFighter1 === "Red" ? "Blue" : "Red", // Automatically assign the opposite color
      ring: selectedRing,
    };

    try {
      const response = await fetch(`${ domain_uri }/addFighterToMatch.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(matchData),
      });

      if (response.ok) {
        // const data = await response.json();
        // console.log("Response from server:", data);

        // Trigger refresh after adding a match
        triggerRefresh();
      } else {
        console.error("Failed to add match, server responded with:", response.status);
      }
    } catch (error) {
      console.error("Error submitting match data:", error);
      alert("Failed to submit match data.");
    }
  };

  return (
    <div>
      <h2>Match Fighters</h2>
      <div>
        <label>Fighter 1:</label>
        <select value={selectedFighter1} onChange={handleFighter1Change}>
          {fighters
            .filter((f) => f.fighterId !== selectedFighter2)
            .map((fighter) => (
              <option key={fighter.fighterId} value={fighter.fighterId}>
                {fighter.fighterName}
              </option>
            ))}
        </select>
        <label>
          <input
            type="radio"
            checked={colorFighter1 === "Red"}
            onChange={() => handleColorChange("Red")}
          />
          Red
        </label>
        <label>
          <input
            type="radio"
            checked={colorFighter1 === "Blue"}
            onChange={() => handleColorChange("Blue")}
          />
          Blue
        </label>
      </div>
      <div>
        <label>Fighter 2:</label>
        <select value={selectedFighter2} onChange={handleFighter2Change}>
          {fighters
            .filter((f) => f.fighterId !== selectedFighter1)
            .map((fighter) => (
              <option key={fighter.fighterId} value={fighter.fighterId}>
                {fighter.fighterName}
              </option>
            ))}
        </select>
        <span>{colorFighter1 === "Red" ? "Blue" : "Red"}</span>
      </div>
      <div>
        <label>Ring:</label>
        <select value={selectedRing} onChange={handleRingChange}>
          {Array.from({ length: 6 }, (_, i) => i + 1).map((ring) => (
            <option key={ring} value={ring}>{`Ring ${ring}`}</option>
          ))}
        </select>
      </div>
      <button onClick={handleSubmit}>Submit Match</button>
    </div>
  );
};

export default MatchFighters;
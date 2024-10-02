// MatchFighters.tsx
import React, { useState, useCallback, useMemo } from "react";
import { useRefresh } from "../../utility/RefreshContext"; // Import the refresh hook
import { domain_uri } from "../../utility/contants";
import { useToast } from '../../utility/ToastProvider'; // Import the useToast hook from ToastProvider

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
  const addToast = useToast(); // Use the toast hook to trigger toast notifications

  if (fighters.length < 2) {
    return <div>Not enough fighters to match.</div>;
  }

  const [selectedFighter1, setSelectedFighter1] = useState(fighters[0].fighterId);
  const [selectedFighter2, setSelectedFighter2] = useState(fighters[1].fighterId);
  const [selectedRing, setSelectedRing] = useState(1);
  const [colorFighter1, setColorFighter1] = useState("Red"); // Default first fighter to Red

  // Memoized change handlers
  const handleFighter1Change = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedFighter1(parseInt(event.target.value));
  }, []);

  const handleFighter2Change = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedFighter2(parseInt(event.target.value));
  }, []);

  const handleRingChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedRing(parseInt(event.target.value));
  }, []);

  const handleColorChange = useCallback((color: string) => {
    setColorFighter1(color);
  }, []);

  // Memoize filtered fighter options
  const filteredFighter1Options = useMemo(() => 
    fighters.filter((f) => f.fighterId !== selectedFighter2), 
    [fighters, selectedFighter2]
  );

  const filteredFighter2Options = useMemo(() => 
    fighters.filter((f) => f.fighterId !== selectedFighter1), 
    [fighters, selectedFighter1]
  );

  const handleSubmit = async () => {
    const matchData = {
      fighter1: selectedFighter1,
      fighter2: selectedFighter2,
      colorFighter1: colorFighter1,
      colorFighter2: colorFighter1 === "Red" ? "Blue" : "Red", // Automatically assign the opposite color
      ring: selectedRing,
    };

    try {
      const response = await fetch(`${domain_uri}/addFighterToMatch.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(matchData),
      });

      console.log(response);

      if (response.ok) {
        triggerRefresh(); // Trigger refresh after adding a match
        addToast("Fighters Matched");
      } else {
        console.error("Failed to add match, server responded with:", response.status);
        addToast("Match Error");
      }
    } catch (error) {
      console.error("Error submitting match data:", error);
      addToast("Failed to submit match data.");
    }
  };

  return (
    <div>
      <h2>Match Fighters</h2>
      <div>
        <label>Fighter 1:</label>
        <select value={selectedFighter1} onChange={handleFighter1Change}>
          {filteredFighter1Options.map((fighter) => (
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
          {filteredFighter2Options.map((fighter) => (
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
          {/* {Array.from({ length: 6 }, (_, i) => i + 1).map((ring) => (
            <option key={ring} value={ring}>{`Ring ${ring}`}</option>
          ))} */}
          {/* Temp values for the tournament */}
          <option key={1} value={1}>{`Open Longsword Ring 1`}</option>
          <option key={2} value={2}>{`Open Longsword Ring 2`}</option>
          <option key={3} value={3}>{`Women's Longsword`}</option>
          <option key={4} value={4}>{`Basket Hilt Ring 1`}</option>
          <option key={5} value={5}>{`Basket Hilt Ring 2`}</option>
          <option key={6} value={6}>{`Mixed Weapons Ring 1`}</option>
          <option key={7} value={7}>{`Mixed Weapons Ring 2`}</option>
        </select>
      </div>
      <button onClick={handleSubmit}>Submit Match</button>
    </div>
  );
};

export default React.memo(MatchFighters);

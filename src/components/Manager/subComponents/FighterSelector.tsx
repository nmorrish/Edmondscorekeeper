import React, { useState } from 'react';
import useFighterData from './useFighterData';
import { domain_uri } from "../../utility/contants";

interface FighterSelectorProps {
  currentFighterId: number;
  currentFighterColor: string;
  matchId: number;
  fighterNumber: 'fighter1' | 'fighter2'; 
  onUpdate: (fighterId: number, fighterName: string, fighterColor: string) => void;
}

const FighterSelector: React.FC<FighterSelectorProps> = ({
  currentFighterId,
  currentFighterColor,
  matchId,
  fighterNumber,
  onUpdate,
}) => {
  const [selectedFighterId, setSelectedFighterId] = useState(currentFighterId);
  const [selectedFighterName, setSelectedFighterName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const { fighters } = useFighterData();

  const handleFighterChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newFighterId = Number(event.target.value);
    setSelectedFighterId(newFighterId);

    const selectedFighterData = fighters.find(f => f.fighterId === newFighterId);

    if (selectedFighterData) {
      setSelectedFighterName(selectedFighterData.fighterName);
      setIsUpdating(true);

      try {
        const response = await fetch(`${domain_uri}/updateFighters.php`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            [fighterNumber]: {
              id: newFighterId,
              name: selectedFighterData.fighterName,
              color: currentFighterColor,
            },
            matchId: matchId,
          }),
        });

        const result = await response.json();

        if (result.status === 'success') {
          onUpdate(newFighterId, selectedFighterData.fighterName, currentFighterColor);
        } else {
          console.error('Error updating fighter:', result.message);
        }
      } catch (error) {
        console.error('Error sending update request:', error);
      } finally {
        setIsUpdating(false);
      }
    }
  };

  return (
    <div className="dropdown-container">
      {isUpdating && <p>Updating fighter data...</p>}
      <select className="select-dropdown" value={selectedFighterId} onChange={handleFighterChange}>
        {fighters.map((f) => (
          <option key={f.fighterId} value={f.fighterId}>
            {f.fighterName}
          </option>
        ))}
      </select>
    </div>
  );
};

export default FighterSelector;

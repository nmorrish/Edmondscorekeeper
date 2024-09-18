import React, { useState, useCallback } from "react";
import FormInputComponent from "./FormInputComponent";
import { domain_uri } from "../../utility/contants";

interface FighterEntryFormProps {
  onFightersAdded: () => void; // Callback to refresh data
}

interface FighterData {
  name: string;
}

const FighterEntryForm: React.FC<FighterEntryFormProps> = ({ onFightersAdded }) => {
  const addFightersUrl = `${domain_uri}/addFighters.php`;
  const [fighters, setFighters] = useState<FighterData[]>([{ name: "" }]);

  // Memoized handleChange function
  const handleChange = useCallback(
    (index: number) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target;
      setFighters((prevFighters) => {
        const newFighters = [...prevFighters];
        newFighters[index].name = value;
        return newFighters;
      });
    },
    []
  );

  // Memoized handleAddFighter function
  const handleAddFighter = useCallback(() => {
    setFighters((prevFighters) => [...prevFighters, { name: "" }]);
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const response = await fetch(addFightersUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fighters),
      });

      if (response.ok) {
        // Reset the form fields to the initial state
        setFighters([{ name: "" }]);

        // Trigger a refresh after adding fighters
        onFightersAdded();
      } else {
        console.error("Failed to add fighters, server responded with:", response.status);
      }
    } catch (error) {
      console.error("Error submitting data:", error);
    }
  };

  return (
    <>
      <h2>Add Fighters</h2>
      <form onSubmit={handleSubmit}>
        {fighters.map((fighter, index) => (
          <FormInputComponent
            key={index}
            label={`Fighter ${index + 1}`}
            name={`fighter-${index}`}
            value={fighter.name}
            onChange={handleChange(index)}
          />
        ))}
        <button type="button" onClick={handleAddFighter}>
          +1 Entry Box
        </button>
        <button type="submit">Save Fighters</button>
      </form>
    </>
  );
};

export default FighterEntryForm;

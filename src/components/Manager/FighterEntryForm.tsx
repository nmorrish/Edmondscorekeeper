// FighterEntryForm.tsx
import React, { useState } from "react";
import FormInputComponent from "./FormInputComponent";
import {domain_uri} from '../contants';

interface FighterEntryFormProps {
  onFightersAdded: () => void; // Callback to refresh data
}

interface FighterData {
  name: string;
}

const FighterEntryForm: React.FC<FighterEntryFormProps> = ({ onFightersAdded }) => {
  const addFightersUrl = `${domain_uri}/addFighters.php`;
  const [fighters, setFighters] = useState<FighterData[]>([{ name: "" }]);

  const handleChange = (index: number) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setFighters((prevFighters) => {
      const newFighters = [...prevFighters];
      newFighters[index].name = value;
      return newFighters;
    });
  };

  const handleAddFighter = () => {
    setFighters((prevFighters) => [...prevFighters, { name: "" }]);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const response = await fetch(addFightersUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fighters),
      });

      if (response.ok) {
        // const result = await response.json();
        // console.log("Submission result:", result);

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

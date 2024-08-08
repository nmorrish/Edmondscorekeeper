// useFighterData.ts
import { useState, useEffect, useCallback } from "react";

interface Fighter {
  fighterId: number;
  fighterName: string;
  strikes: number;
}

const useFighterData = () => {
  const [fighters, setFighters] = useState<Fighter[]>([]);

  const fetchFighterData = useCallback(async () => {
    try {
      const response = await fetch("http://localhost/Edmondscorekeeper/listFighters.php");
      if (response.ok) {
        const data = await response.json();
        setFighters(data);
        console.log("Fetched fighters:", data);
      } else {
        console.error("Failed to fetch fighters, server responded with:", response.status);
      }
    } catch (error) {
      console.error("Failed to fetch fighters:", error);
    }
  }, []);

  useEffect(() => {
    fetchFighterData(); // Fetch data on mount
  }, [fetchFighterData]);

  return { fighters, fetchFighterData }; // Return data and refresh function
};

export default useFighterData;

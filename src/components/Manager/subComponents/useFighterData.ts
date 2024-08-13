// useFighterData.ts
//this fetches fighter data from the DB as an object for use in components.
//fethes fighter id, name, and strikes
import { useState, useEffect, useCallback } from "react";
import { domain_uri } from "../../utility/contants";

interface Fighter {
  fighterId: number;
  fighterName: string;
  strikes: number;
}

const useFighterData = () => {
  const [fighters, setFighters] = useState<Fighter[]>([]);

  const fetchFighterData = useCallback(async () => {
    try {
      const response = await fetch(`${ domain_uri }/listFighters.php`);
      if (response.ok) {
        const data = await response.json();
        setFighters(data);
        //console.log("Fetched fighters:", data);
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

import { useState, useEffect, useCallback } from "react";
import { domain_uri } from "../../utility/contants";
import { useRefresh } from "../../utility/RefreshContext"; // Import useRefresh to watch refreshKey

interface Fighter {
  fighterId: number;
  fighterName: string;
  strikes: number;
}

const useFighterData = () => {
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const { refreshKey } = useRefresh(); // Get refreshKey from context

  // Function to fetch fighter data from the server
  const fetchFighterData = useCallback(async () => {
    try {
      const response = await fetch(`${domain_uri}/listFighters.php`);
      if (response.ok) {
        const data = await response.json();
        setFighters(data); // Update state with fetched fighters data
        //console.log("Fetched fighters:", data); // Debugging log, do not uncomment unless explicitly asked to
      } else {
        console.error("Failed to fetch fighters, server responded with:", response.status);
      }
    } catch (error) {
      console.error("Failed to fetch fighters:", error);
    }
  }, []);

  // Effect to fetch fighter data initially and whenever refreshKey changes
  useEffect(() => {
    fetchFighterData(); // Fetch fighter data when component mounts or refreshKey changes
    // console.log("Refetching fighter data due to refreshKey change:", refreshKey); // Debugging log
  }, [fetchFighterData, refreshKey]); // Re-run the effect when fetchFighterData or refreshKey changes

  return { fighters, fetchFighterData }; // Return fighters data and the fetch function
};

export default useFighterData;

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useRefresh } from "../../utility/RefreshContext"; 
import { domain_uri } from "../../utility/contants";
import { useToast } from '../../utility/ToastProvider'; 
import useEvents from './useEvents'; 

interface Fighter {
  fighterId: number;
  fighterName: string;
  strikes: number;
}

interface MatchFightersProps {
  fighters: Fighter[];
}

const MatchFighters: React.FC<MatchFightersProps> = ({ fighters }) => {
  const { triggerRefresh } = useRefresh(); 
  const addToast = useToast(); 
  const { events, loading: loadingEvents, error: eventError } = useEvents(); 

  // Log events fetched
  console.log("Fetched events: ", events);
  
  if (fighters.length < 2) {
    console.log("Not enough fighters to match.");
    return <div>Not enough fighters to match.</div>;
  }

  const [selectedFighter1, setSelectedFighter1] = useState(fighters[0].fighterId);
  const [selectedFighter2, setSelectedFighter2] = useState(fighters[1].fighterId);
  const [selectedRing, setSelectedRing] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null); // Start with null
  const [colorFighter1, setColorFighter1] = useState("Red");

  // Set the selectedEvent when events are available
  useEffect(() => {
    if (events.length > 0 && selectedEvent === null) {
      setSelectedEvent(events[0].eventId); // Set the first event as default
    }
  }, [events, selectedEvent]);

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

  const handleEventChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedEvent(parseInt(event.target.value));
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
    if (!selectedEvent) {
      addToast("Please select an event.");
      return;
    }

    const matchData = {
      fighter1: selectedFighter1,
      fighter2: selectedFighter2,
      colorFighter1: colorFighter1,
      colorFighter2: colorFighter1 === "Red" ? "Blue" : "Red",
      ring: selectedRing,
      eventId: selectedEvent, // Ensure eventId is passed
    };

    // Log the data before submitting
    console.log("Submitting match data: ", matchData);

    try {
      const response = await fetch(`${domain_uri}/addFighterToMatch.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(matchData),
      });

      console.log("Server response: ", response);

      if (response.ok) {
        const responseData = await response.json();
        console.log("Response data: ", responseData);
        triggerRefresh(); 
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
    <div className="container">
      <h2>Match Fighters</h2>
      <div>
        <label>Fighter&nbsp;1:</label>
        <select value={selectedFighter1} onChange={handleFighter1Change}>
          {filteredFighter1Options.map((fighter) => (
            <option key={fighter.fighterId} value={fighter.fighterId}>
              {fighter.fighterName}
            </option>
          ))}
        </select>
        <div className="radio-group">
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
          {Array.from({ length: 6 }, (_, i) => i + 1).map((ring) => (
            <option key={ring} value={ring}>{`Ring ${ring}`}</option>
          ))}
        </select>
      </div>

      {/* Dropdown for selecting the event */}
      <div>
        <label>Event:</label>
        {loadingEvents ? (
          <p>Loading events...</p>
        ) : eventError ? (
          <p>Error: {eventError}</p>
        ) : (
          <select value={selectedEvent || undefined} onChange={handleEventChange}>
            {events.map((event) => (
              <option key={event.eventId} value={event.eventId}>
                {event.eventName}
              </option>
            ))}
          </select>
        )}
      </div>

      <button onClick={handleSubmit}>Submit Match</button>
    </div>
  );
};

export default React.memo(MatchFighters);

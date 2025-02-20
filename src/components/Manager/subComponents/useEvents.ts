import { useState, useEffect } from 'react';
import { domain_uri } from "../../utility/contants";

interface Event {
  eventId: number;
  eventName: string;
}

const useEvents = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch event data from the PHP API
    const fetchEvents = async () => {
      try {
        const response = await fetch(`${domain_uri}/listEvents.php`);
        const data = await response.json();
        if (data.status === 'success') {
          setEvents(data.events);
        } else {
          setError(data.message);
        }
      } catch (error) {
        setError('Failed to fetch events.');
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  return { events, loading, error };
};

export default useEvents;

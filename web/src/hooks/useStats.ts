import { useEffect, useState } from "react";

export interface StatsData {
  loaded: boolean;
  totalPresses: number;
  factionCounts: Record<number, number>;
  closestCallSeconds: number | null;
  closestCallUsername: string | null;
  lastPresserUsername: string | null;
  uptimeSeconds: number | null;
  alive: boolean;
  started: boolean;
}

const INITIAL: StatsData = {
  loaded: false,
  totalPresses: 0,
  factionCounts: {},
  closestCallSeconds: null,
  closestCallUsername: null,
  lastPresserUsername: null,
  uptimeSeconds: null,
  alive: false,
  started: false
};

/** Polls /api/stats — StatsPage's core aggregate numbers, the database
 *  equivalent of reading the contract's own aggregate state directly. */
export function useStats(): StatsData {
  const [stats, setStats] = useState<StatsData>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      fetch("/api/stats")
        .then((res) => {
          if (!res.ok) throw new Error(`stats fetch failed: ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (!cancelled) setStats({ loaded: true, ...data });
        })
        .catch(() => {
          // Leave the last known values in place rather than blank the page.
        });
    }
    refresh();
    const interval = setInterval(refresh, 5_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return stats;
}

import { useEffect, useState } from "react";

export interface GameState {
  loaded: boolean;
  stale: boolean;
  started: boolean;
  alive: boolean;
  startedAt: number | null;
  deadlineMs: number | null;
  totalPresses: number;
  closestCallSeconds: number | null;
  closestCallUsername: string | null;
  lastPresserUsername: string | null;
  lastPressFaction: number | null;
  lastPressRemainingSeconds: number | null;
  resetCount: number;
  error: string | null;
}

const INITIAL_STATE: GameState = {
  loaded: false,
  stale: false,
  started: false,
  alive: false,
  startedAt: null,
  deadlineMs: null,
  totalPresses: 0,
  closestCallSeconds: null,
  closestCallUsername: null,
  lastPresserUsername: null,
  lastPressFaction: null,
  lastPressRemainingSeconds: null,
  resetCount: 0,
  error: null
};

/** Polls the database-backed /api/state — the direct replacement for
 *  useExperimentState's onchain reads. Same shared-clock idea, same polling
 *  cadence, just a real Postgres row instead of a contract. */
export function useGameState(): GameState {
  const [state, setState] = useState<GameState>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch("/api/state");
        if (!res.ok) throw new Error(`state fetch failed: ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setState({
          loaded: true,
          stale: false,
          started: data.started,
          alive: data.alive,
          startedAt: data.startedAt ? new Date(data.startedAt).getTime() : null,
          deadlineMs: data.deadline ? new Date(data.deadline).getTime() : null,
          totalPresses: data.totalPresses,
          closestCallSeconds: data.closestCallSeconds,
          closestCallUsername: data.closestCallUsername,
          lastPresserUsername: data.lastPresserUsername,
          lastPressFaction: data.lastPressFaction,
          lastPressRemainingSeconds: data.lastPressRemainingSeconds,
          resetCount: data.resetCount,
          error: null
        });
      } catch (error) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          stale: prev.loaded,
          error: prev.loaded ? "SERVER DEGRADED · LAST KNOWN STATE PRESERVED" : `SERVER ERROR · ${error instanceof Error ? error.message : "UNKNOWN"}`
        }));
      }
    }

    refresh();
    const interval = setInterval(refresh, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return state;
}

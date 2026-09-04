import { useEffect, useState } from "react";
import { countSince } from "../data/eventDb";
import type { EventSyncStatus } from "./useEventSync";

export interface WindowCounts {
  lastHour: number;
  last24h: number;
}

const EMPTY: WindowCounts = { lastHour: 0, last24h: 0 };

/** Presses in the last hour / 24 hours — the one stat category that genuinely needs
 *  the event history rather than the contract's own aggregate state, since the
 *  contract has no concept of a time window. */
export function useWindowCounts(sync: EventSyncStatus): WindowCounts {
  const [counts, setCounts] = useState<WindowCounts>(EMPTY);

  useEffect(() => {
    if (!sync.db) return;
    let cancelled = false;
    const db = sync.db;
    const nowSec = Math.floor(Date.now() / 1000);
    Promise.all([countSince(db, nowSec - 3_600), countSince(db, nowSec - 86_400)]).then(([lastHour, last24h]) => {
      if (!cancelled) setCounts({ lastHour, last24h });
    });
    return () => {
      cancelled = true;
    };
  }, [sync.db, sync.version]);

  return counts;
}

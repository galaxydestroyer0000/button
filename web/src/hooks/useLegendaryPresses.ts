import { useEffect, useState } from "react";
import { getLegendaryPresses } from "../data/eventDb";
import type { PressEvent } from "../domain/types";
import type { EventSyncStatus } from "./useEventSync";

/** Every press at or under `maxRemaining` seconds — the "closest possible calls"
 *  legendary tier. */
export function useLegendaryPresses(sync: EventSyncStatus, maxRemaining: number): PressEvent[] {
  const [events, setEvents] = useState<PressEvent[]>([]);

  useEffect(() => {
    if (!sync.db) return;
    let cancelled = false;
    getLegendaryPresses(sync.db, maxRemaining).then((result) => {
      if (!cancelled) setEvents(result);
    });
    return () => {
      cancelled = true;
    };
  }, [sync.db, sync.version, maxRemaining]);

  return events;
}

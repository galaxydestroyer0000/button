import { useEffect, useState } from "react";
import { getClosestCalls } from "../data/eventDb";
import type { PressEvent } from "../domain/types";
import type { EventSyncStatus } from "./useEventSync";

/** The N closest calls ever, closest first — the hall of fame. */
export function useClosestCalls(sync: EventSyncStatus, limit: number): PressEvent[] {
  const [events, setEvents] = useState<PressEvent[]>([]);

  useEffect(() => {
    if (!sync.db) return;
    let cancelled = false;
    getClosestCalls(sync.db, limit).then((result) => {
      if (!cancelled) setEvents(result);
    });
    return () => {
      cancelled = true;
    };
  }, [sync.db, sync.version, limit]);

  return events;
}

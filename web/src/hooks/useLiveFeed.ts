import { useEffect, useState } from "react";
import { getTopEvents } from "../data/eventDb";
import type { PressEvent } from "../domain/types";
import type { EventSyncStatus } from "./useEventSync";

/** The N most recent presses, newest first — backs the homepage's live tape. */
export function useLiveFeed(sync: EventSyncStatus, limit: number): PressEvent[] {
  const [events, setEvents] = useState<PressEvent[]>([]);

  useEffect(() => {
    if (!sync.db) return;
    let cancelled = false;
    getTopEvents(sync.db, limit).then((result) => {
      if (!cancelled) setEvents(result);
    });
    return () => {
      cancelled = true;
    };
  }, [sync.db, sync.version, limit]);

  return events;
}

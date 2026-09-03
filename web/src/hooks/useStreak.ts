import { useMemo } from "react";
import type { PressEvent } from "../domain/types";

export function useStreak(events: PressEvent[]): number {
  return useMemo(() => {
    if (events.length === 0) return 0;
    const leadingFaction = events[0].faction;
    let streak = 0;
    for (const event of events) {
      if (event.faction !== leadingFaction) break;
      streak += 1;
    }
    return streak;
  }, [events]);
}

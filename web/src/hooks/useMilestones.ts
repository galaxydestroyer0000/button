import { useEffect, useState } from "react";
import { getPressByNumber } from "../data/eventDb";
import type { PressEvent } from "../domain/types";
import type { EventSyncStatus } from "./useEventSync";

const MILESTONE_NUMBERS = [1, 10, 100, 1_000, 10_000, 100_000];

export interface Milestone {
  pressNumber: number;
  event: PressEvent | null;
}

/** The round-number presses the experiment has actually reached (1st, 10th, 100th,
 *  ...), each resolved to its real event once locally indexed. Only milestones the
 *  contract's own totalPresses confirms have happened are included — never a
 *  projected/future one. */
export function useMilestones(sync: EventSyncStatus, totalPresses: number): Milestone[] {
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  useEffect(() => {
    if (!sync.db) return;
    let cancelled = false;
    const db = sync.db;
    const reached = MILESTONE_NUMBERS.filter((n) => n <= totalPresses);
    Promise.all(reached.map((n) => getPressByNumber(db, n))).then((events) => {
      if (cancelled) return;
      setMilestones(reached.map((pressNumber, i) => ({ pressNumber, event: events[i] })));
    });
    return () => {
      cancelled = true;
    };
  }, [sync.db, sync.version, totalPresses]);

  return milestones;
}

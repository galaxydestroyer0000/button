import { useEffect, useState } from "react";
import { getPressByNumber, wasNewClosestCallAtTheTime } from "../data/eventDb";
import type { PressEvent } from "../domain/types";
import type { EventSyncStatus } from "./useEventSync";

export interface PressLookup {
  /** null while still resolving; "not-found" once sync has caught up past this press
   *  number without finding it (a number that was never pressed, or doesn't exist
   *  yet); the event itself once found. */
  status: "loading" | "not-found" | "found";
  event: PressEvent | null;
  wasNewClosestCall: boolean;
}

/** Looks up a single press by its number from the local store. Distinguishes "still
 *  syncing, might still appear" from "sync is caught up and this number genuinely
 *  doesn't exist" using the caller-supplied `totalPresses` (from live contract
 *  state) rather than guessing from freshness alone. */
export function usePressByNumber(sync: EventSyncStatus, pressNumber: number, totalPresses: number): PressLookup {
  const [result, setResult] = useState<PressLookup>({ status: "loading", event: null, wasNewClosestCall: false });

  useEffect(() => {
    if (!sync.db || !Number.isFinite(pressNumber) || pressNumber < 1) return;
    let cancelled = false;
    const db = sync.db;
    getPressByNumber(db, pressNumber).then(async (event) => {
      if (cancelled) return;
      if (event) {
        const wasRecord = await wasNewClosestCallAtTheTime(db, event);
        if (!cancelled) setResult({ status: "found", event, wasNewClosestCall: wasRecord });
        return;
      }
      // Not found locally yet. If the chain itself has already produced this many
      // presses and sync is caught up, it genuinely doesn't exist (e.g. a typo'd
      // number, or one greater than totalPresses); otherwise it's still backfilling.
      const caughtUp = sync.freshness === "LIVE · ONCHAIN";
      setResult({ status: caughtUp && pressNumber <= totalPresses ? "not-found" : "loading", event: null, wasNewClosestCall: false });
    });
    return () => {
      cancelled = true;
    };
  }, [sync.db, sync.version, sync.freshness, pressNumber, totalPresses]);

  return result;
}

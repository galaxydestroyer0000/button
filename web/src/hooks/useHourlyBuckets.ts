import { useEffect, useState } from "react";
import { bucketCounts } from "../data/eventDb";
import type { EventSyncStatus } from "./useEventSync";

const HOURS = 24;
const BUCKET_SECONDS = 3_600;

/** Press counts for each of the last 24 hourly buckets, oldest first. */
export function useHourlyBuckets(sync: EventSyncStatus): number[] {
  const [buckets, setBuckets] = useState<number[]>(() => new Array(HOURS).fill(0));

  useEffect(() => {
    if (!sync.db) return;
    let cancelled = false;
    const db = sync.db;
    const nowSec = Math.floor(Date.now() / 1000);
    const sinceSec = nowSec - HOURS * BUCKET_SECONDS;
    bucketCounts(db, sinceSec, BUCKET_SECONDS, HOURS).then((result) => {
      if (!cancelled) setBuckets(result);
    });
    return () => {
      cancelled = true;
    };
  }, [sync.db, sync.version]);

  return buckets;
}

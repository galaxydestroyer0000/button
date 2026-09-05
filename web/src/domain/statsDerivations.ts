import type { PressEvent } from "./types";
import type { Milestone } from "../hooks/useMilestones";

export interface WindowCounts {
  lastHour: number;
  last24h: number;
}

/** Pure derivations over the full press list — the database-backed
 *  equivalent of eventDb.ts's IndexedDB queries (countSince, bucketCounts,
 *  getClosestCalls, getLegendaryPresses, getPressByNumber), now just plain
 *  array operations since useAllPresses already has everything in memory. */

export function windowCounts(events: readonly PressEvent[], nowSec: number): WindowCounts {
  let lastHour = 0;
  let last24h = 0;
  for (const e of events) {
    if (e.timestamp >= nowSec - 86_400) last24h++;
    if (e.timestamp >= nowSec - 3_600) lastHour++;
  }
  return { lastHour, last24h };
}

export function hourlyBuckets(events: readonly PressEvent[], nowSec: number, hours = 24): number[] {
  const buckets = new Array(hours).fill(0);
  const sinceSec = nowSec - hours * 3_600;
  for (const e of events) {
    if (e.timestamp < sinceSec) continue;
    const bucket = Math.floor((e.timestamp - sinceSec) / 3_600);
    if (bucket >= 0 && bucket < hours) buckets[bucket]++;
  }
  return buckets;
}

export function closestCalls(events: readonly PressEvent[], limit: number): PressEvent[] {
  return [...events].sort((a, b) => a.remaining - b.remaining).slice(0, limit);
}

export function legendaryPresses(events: readonly PressEvent[], maxRemaining: number): PressEvent[] {
  return events.filter((e) => e.remaining <= maxRemaining).sort((a, b) => a.remaining - b.remaining);
}

const MILESTONE_NUMBERS = [1, 10, 100, 1_000, 10_000, 100_000];

export function milestones(events: readonly PressEvent[], totalPresses: number): Milestone[] {
  const byNumber = new Map(events.map((e) => [e.pressNumber, e]));
  return MILESTONE_NUMBERS.filter((n) => n <= totalPresses).map((n) => ({ pressNumber: n, event: byNumber.get(n) ?? null }));
}

import { useEffect, useState } from "react";
import type { PressEvent } from "../domain/types";

interface AllPressesResult {
  events: PressEvent[];
  loaded: boolean;
}

/** Fetches every press once (GET /api/history?all=true) for StatsPage's richer
 *  sections to derive window counts, hourly buckets, closest calls, legendary
 *  near-misses, and milestones from — the database equivalent of the old
 *  IndexedDB-backed event cache those sections used to query directly. Mapped
 *  into the same PressEvent shape those components already render, with
 *  `presser` holding a username instead of an address (see PressListRow's
 *  isWallet check) and no real txHash/blockNumber/logIndex to report. */
export function useAllPresses(): AllPressesResult {
  const [result, setResult] = useState<AllPressesResult>({ events: [], loaded: false });

  useEffect(() => {
    let cancelled = false;

    function refresh() {
      fetch("/api/history?all=true")
        .then((res) => {
          if (!res.ok) throw new Error(`history fetch failed: ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (cancelled) return;
          const rows = data.presses as { press_number: number; username: string; faction: number; remaining_seconds: number; pressed_at: string }[];
          setResult({
            loaded: true,
            events: rows.map((row) => ({
              key: `db-${row.press_number}`,
              txHash: "",
              presser: row.username as `0x${string}`,
              remaining: row.remaining_seconds,
              faction: row.faction,
              timestamp: Math.floor(new Date(row.pressed_at).getTime() / 1000),
              pressNumber: row.press_number,
              blockNumber: 0,
              logIndex: 0
            }))
          });
        })
        .catch(() => {
          if (!cancelled) setResult((prev) => ({ ...prev, loaded: true }));
        });
    }

    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return result;
}

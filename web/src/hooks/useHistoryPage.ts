import { useEffect, useState } from "react";

export interface HistoryRowData {
  pressNumber: number;
  username: string;
  faction: number;
  remainingSeconds: number;
  pressedAt: string;
}

interface HistoryPageResult {
  items: HistoryRowData[];
  total: number;
  loading: boolean;
  error: string | null;
}

const INITIAL: HistoryPageResult = { items: [], total: 0, loading: true, error: null };

/** Pages through /api/history — the database equivalent of useEventPage's
 *  client-side IndexedDB filtering. Server-side now, since there's no local
 *  cache of every press to filter in the browser. */
export function useHistoryPage(
  page: number,
  filters: { faction?: number; username?: string; pressNumber?: number }
): HistoryPageResult {
  const [result, setResult] = useState<HistoryPageResult>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    setResult((prev) => ({ ...prev, loading: true }));

    const params = new URLSearchParams({ page: String(page) });
    if (filters.faction !== undefined) params.set("faction", String(filters.faction));
    if (filters.username) params.set("username", filters.username);
    if (filters.pressNumber !== undefined) params.set("pressNumber", String(filters.pressNumber));

    fetch(`/api/history?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`history fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setResult({
          items: (data.presses as { press_number: number; username: string; faction: number; remaining_seconds: number; pressed_at: string }[]).map(
            (row) => ({
              pressNumber: row.press_number,
              username: row.username,
              faction: row.faction,
              remainingSeconds: row.remaining_seconds,
              pressedAt: row.pressed_at
            })
          ),
          total: data.total,
          loading: false,
          error: null
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setResult((prev) => ({ ...prev, loading: false, error: error instanceof Error ? error.message : "unknown error" }));
      });

    return () => {
      cancelled = true;
    };
  }, [page, filters.faction, filters.username, filters.pressNumber]);

  return result;
}

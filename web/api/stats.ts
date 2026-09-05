import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, getGameState, isAlive } from "./_db.js";

/** Aggregate stats computed live from the real `presses` table on every
 *  request — faction distribution, uptime, closest call — the database
 *  equivalent of StatsPanel's onchain reads. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "GET only" });
    return;
  }

  try {
    const [state, factionRows] = await Promise.all([
      getGameState(),
      sql`SELECT faction, COUNT(*)::int AS count FROM presses GROUP BY faction ORDER BY faction`
    ]);

    const factionCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const row of factionRows as { faction: number; count: number }[]) {
      factionCounts[row.faction] = row.count;
    }

    const now = new Date();
    const uptimeSeconds = state.started_at ? Math.max(0, Math.floor((now.getTime() - new Date(state.started_at).getTime()) / 1000)) : null;

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      totalPresses: state.total_presses,
      factionCounts,
      closestCallSeconds: state.closest_call_seconds,
      closestCallUsername: state.closest_call_username,
      lastPresserUsername: state.last_presser_username,
      uptimeSeconds,
      alive: isAlive(state, now),
      started: state.started
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "unknown error" });
  }
}

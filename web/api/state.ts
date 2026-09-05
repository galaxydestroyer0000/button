import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getGameState, isAlive } from "./_db.js";

/** The database-backed equivalent of useExperimentState's onchain reads — same
 *  shape of answer (started/alive/deadline/totals), just from Postgres instead
 *  of a contract. No caching: the whole point is every visitor sees the real,
 *  current, shared state. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "GET only" });
    return;
  }

  try {
    const state = await getGameState();
    const now = new Date();
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      loaded: true,
      started: state.started,
      alive: isAlive(state, now),
      startedAt: state.started_at,
      deadline: state.deadline,
      totalPresses: state.total_presses,
      closestCallSeconds: state.closest_call_seconds,
      closestCallUsername: state.closest_call_username,
      lastPresserUsername: state.last_presser_username,
      lastPressFaction: state.last_press_faction,
      lastPressRemainingSeconds: state.last_press_remaining_seconds,
      resetCount: state.reset_count,
      serverNow: now.toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "unknown error" });
  }
}

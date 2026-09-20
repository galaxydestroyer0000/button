import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, WINDOW_SECONDS, getGameState, isAlive } from "./_db.js";

/** A Solana address is a base58-encoded 32-byte public key: 32 to 44 characters
 *  from the base58 alphabet (no 0, O, I, or l). This checks shape only, not that
 *  the address is a real mint. */
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** The database-backed equivalent of start()/resetTimer() — called by
 *  AdminPage right after the real onchain transaction succeeds, so one click
 *  drives both the (now mostly symbolic) contract and the actual game users
 *  see. Also carries the one action with no onchain counterpart at all,
 *  setTokenCA, which just writes the operator-supplied Solana token contract address
 *  users see in the site-wide CA banner. Protected by web/middleware.ts's
 *  session-cookie gate, same as /admin itself — see the matcher there for
 *  exactly what's covered. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  const action = req.body?.action;
  if (action !== "start" && action !== "reset" && action !== "setTokenCA") {
    res.status(400).json({ error: "INVALID_ACTION", message: 'action must be "start", "reset", or "setTokenCA"' });
    return;
  }

  if (action === "setTokenCA") {
    const raw = typeof req.body?.value === "string" ? req.body.value.trim() : "";
    if (raw.length > 0 && !SOLANA_ADDRESS_PATTERN.test(raw)) {
      res.status(400).json({ error: "INVALID_SOLANA_ADDRESS", message: "NOT A VALID SOLANA ADDRESS. EXPECTED 32 TO 44 BASE58 CHARACTERS." });
      return;
    }
    const tokenCA = raw.length > 0 ? raw : null;
    try {
      await sql`UPDATE game_state SET token_ca = ${tokenCA} WHERE id = 1`;
      res.status(200).json({ tokenCA });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "unknown error" });
    }
    return;
  }

  try {
    const state = await getGameState();
    const now = new Date();

    if (action === "start") {
      if (state.started) {
        res.status(409).json({ error: "ALREADY_STARTED", message: "THE EXPERIMENT HAS ALREADY BEEN ACTIVATED." });
        return;
      }
      const deadline = new Date(now.getTime() + WINDOW_SECONDS * 1000).toISOString();
      await sql`UPDATE game_state SET started = true, started_at = ${now.toISOString()}, deadline = ${deadline} WHERE id = 1`;
      res.status(200).json({ started: true, startedAt: now.toISOString(), deadline });
      return;
    }

    // action === "reset"
    if (!isAlive(state, now)) {
      res.status(409).json({ error: "NOT_ALIVE", message: "THE EXPERIMENT IS NOT CURRENTLY ALIVE." });
      return;
    }
    const deadline = new Date(now.getTime() + WINDOW_SECONDS * 1000).toISOString();
    await sql`UPDATE game_state SET deadline = ${deadline}, reset_count = reset_count + 1 WHERE id = 1`;
    res.status(200).json({ deadline, resetCount: state.reset_count + 1 });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "unknown error" });
  }
}

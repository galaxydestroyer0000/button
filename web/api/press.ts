import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql, WINDOW_SECONDS, getGameState, isAlive, validateUsername } from "./_db.js";
import { factionForRemaining } from "../src/domain/factions.js";

/** The database-backed equivalent of the contract's press() — same rules
 *  (one username forever, resets the clock to a fresh 60s, faction by
 *  remaining seconds, tracks the closest call), enforced by Postgres instead
 *  of onchain consensus. The uniqueness that used to come from a wallet
 *  address now comes from `presses_username_lower_idx` — real and permanent
 *  in this database, but a username is trivially re-creatable in a way a
 *  wallet with history isn't; see SECURITY.md for the honest comparison. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  const username = validateUsername(req.body?.username);
  if (!username) {
    res.status(400).json({ error: "INVALID_USERNAME", message: "3-20 characters, letters/numbers/underscore only." });
    return;
  }

  try {
    const state = await getGameState();
    const now = new Date();

    if (!state.started) {
      res.status(409).json({ error: "NOT_STARTED", message: "THE EXPERIMENT HASN'T BEEN ACTIVATED YET." });
      return;
    }
    if (!isAlive(state, now)) {
      res.status(409).json({ error: "ENDED", message: "THE BUTTON IS DEAD. THIS IS PERMANENT." });
      return;
    }

    const deadlineMs = new Date(state.deadline as string).getTime();
    const remainingSeconds = Math.max(0, Math.min(WINDOW_SECONDS, Math.round((deadlineMs - now.getTime()) / 1000)));
    const faction = factionForRemaining(remainingSeconds);
    const usernameLower = username.toLowerCase();

    let pressNumber: number;
    let pressedAt: string;
    try {
      const inserted = (await sql`
        INSERT INTO presses (username, username_lower, faction, remaining_seconds)
        VALUES (${username}, ${usernameLower}, ${faction}, ${remainingSeconds})
        RETURNING press_number, pressed_at
      `) as { press_number: number; pressed_at: string }[];
      pressNumber = inserted[0].press_number;
      pressedAt = inserted[0].pressed_at;
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code === "23505") {
        res.status(409).json({ error: "ALREADY_PRESSED", message: "THIS USERNAME HAS ALREADY PRESSED. ONE PRESS FOREVER." });
        return;
      }
      throw error;
    }

    const newDeadline = new Date(now.getTime() + WINDOW_SECONDS * 1000).toISOString();
    await sql`
      UPDATE game_state
      SET total_presses = total_presses + 1, deadline = ${newDeadline}, last_presser_username = ${username},
          last_press_faction = ${faction}, last_press_remaining_seconds = ${remainingSeconds}
      WHERE id = 1
    `;
    await sql`
      UPDATE game_state
      SET closest_call_seconds = ${remainingSeconds}, closest_call_username = ${username}
      WHERE id = 1 AND (closest_call_seconds IS NULL OR ${remainingSeconds} < closest_call_seconds)
    `;

    res.status(200).json({
      pressNumber,
      pressedAt,
      faction,
      remainingSeconds,
      newDeadline
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "unknown error" });
  }
}

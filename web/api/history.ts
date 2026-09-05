import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_db";

const PAGE_SIZE = 50;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Real press history, newest first, from the same `presses` table press.ts
 *  writes to — no synthetic/sample rows, ever. Plain page-number pagination
 *  (not a cursor) since this experiment's whole history comfortably fits a
 *  COUNT(*) at any realistic scale — see api/og.ts's press-lookup comment for
 *  the equivalent judgment call on the old chain-event version of this page. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "GET only" });
    return;
  }

  if (firstParam(req.query.all) === "true") {
    // StatsPage's richer sections (hourly buckets, closest-call hall of fame,
    // legendary near-misses, milestones) all need the *whole* press history to
    // compute client-side, the same way they always worked against the old
    // IndexedDB-backed event cache — just sourced from Postgres now. Fine at
    // this experiment's realistic scale (see the comment above); would need
    // real server-side aggregation endpoints if that scale assumption ever
    // stopped holding.
    try {
      const rows = await sql`SELECT press_number, username, faction, remaining_seconds, pressed_at FROM presses ORDER BY press_number ASC`;
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ presses: rows });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "unknown error" });
    }
    return;
  }

  const pageParam = firstParam(req.query.page);
  const page = pageParam ? Number(pageParam) : 1;
  if (!Number.isInteger(page) || page < 1) {
    res.status(400).json({ error: "INVALID_PAGE" });
    return;
  }

  const factionParam = firstParam(req.query.faction);
  const faction = factionParam ? Number(factionParam) : null;
  if (factionParam && (!Number.isInteger(faction) || faction === null || faction < 1 || faction > 6)) {
    res.status(400).json({ error: "INVALID_FACTION" });
    return;
  }

  const usernameParam = firstParam(req.query.username)?.trim() || null;
  const pressNumberParam = firstParam(req.query.pressNumber);
  const pressNumber = pressNumberParam ? Number(pressNumberParam) : null;
  if (pressNumberParam && (!Number.isInteger(pressNumber) || pressNumber === null)) {
    res.status(400).json({ error: "INVALID_PRESS_NUMBER" });
    return;
  }

  try {
    // Every clause below is optional, so a single parameterized WHERE — built
    // with Neon's sql.query (positional $N params) rather than the tagged
    // template — is far less error-prone than composing several ``sql`...` ``
    // fragments by hand.
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (faction !== null) {
      params.push(faction);
      conditions.push(`faction = $${params.length}`);
    }
    if (usernameParam) {
      params.push(usernameParam.toLowerCase());
      conditions.push(`username_lower = $${params.length}`);
    }
    if (pressNumber !== null) {
      params.push(pressNumber);
      conditions.push(`press_number = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRows = (await sql.query(`SELECT COUNT(*)::int AS total FROM presses ${where}`, params)) as { total: number }[];
    const total = countRows[0]?.total ?? 0;

    const limitParams = [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE];
    const rows = await sql.query(
      `SELECT press_number, username, faction, remaining_seconds, pressed_at FROM presses ${where}
       ORDER BY press_number DESC LIMIT $${limitParams.length - 1} OFFSET $${limitParams.length}`,
      limitParams
    );

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ presses: rows, total });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "unknown error" });
  }
}

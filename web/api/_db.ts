import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — the database-backed game has no connection.");
}

/** Neon's HTTP driver — one query per call, no persistent connection to manage,
 *  which is the right shape for Vercel's serverless functions (a pooled TCP
 *  client would exhaust connections under concurrent invocations). */
export const sql = neon(process.env.DATABASE_URL);

export const WINDOW_SECONDS = 60;

export interface GameStateRow {
  id: number;
  started: boolean;
  started_at: string | null;
  deadline: string | null;
  total_presses: number;
  closest_call_seconds: number | null;
  closest_call_username: string | null;
  last_presser_username: string | null;
  last_press_faction: number | null;
  last_press_remaining_seconds: number | null;
  reset_count: number;
  token_ca: string | null;
}

export interface PressRow {
  press_number: number;
  username: string;
  username_lower: string;
  pressed_at: string;
  faction: number;
  remaining_seconds: number;
}

export async function getGameState(): Promise<GameStateRow> {
  const rows = (await sql`SELECT * FROM game_state WHERE id = 1`) as GameStateRow[];
  const row = rows[0];
  if (!row) throw new Error("game_state row missing — schema migration did not run");
  return row;
}

export function isAlive(state: GameStateRow, now: Date = new Date()): boolean {
  if (!state.started || !state.deadline) return false;
  return now.getTime() < new Date(state.deadline).getTime();
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export function validateUsername(username: unknown): string | null {
  if (typeof username !== "string") return null;
  const trimmed = username.trim();
  return USERNAME_PATTERN.test(trimmed) ? trimmed : null;
}

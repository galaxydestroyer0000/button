import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Loads DATABASE_URL (and the two ADMIN_BASIC_AUTH_* vars) from web/.env.vercel
 *  if present — that file is `vercel env pull`'d locally and gitignored, so CI
 *  and other machines won't have it. These tests hit the real database directly
 *  (never mocked, per this project's whole audit-first ethos) and skip with a
 *  clear message rather than silently pass when there's nothing real to hit. */
function loadLocalEnv(): void {
  const envPath = path.resolve(import.meta.dirname, "../.env.vercel");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)="?(.*?)"?$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
loadLocalEnv();

const hasDatabase = Boolean(process.env.DATABASE_URL);
if (!hasDatabase) {
  console.warn("SKIPPING api/_press.test.ts — no DATABASE_URL (run `vercel env pull web/.env.vercel --environment=production` locally to enable).");
}

describe.skipIf(!hasDatabase)("database-backed game API (real Neon database)", () => {
  // Every row this suite creates is prefixed so it's unmistakable in a real
  // table browse, and afterAll deletes them all — this is a shared dev
  // database, not a disposable one, so leaving no trace matters here more
  // than in a typical throwaway test DB.
  const TEST_PREFIX = "vitest_api_";
  const testUsername = (suffix: string) => `${TEST_PREFIX}${suffix}`;

  let sql: import("@neondatabase/serverless").NeonQueryFunction<false, false>;
  let admin: typeof import("./admin").default;
  let press: typeof import("./press").default;
  let state: typeof import("./state").default;

  function mockReq(method: string, body?: unknown): Parameters<typeof press>[0] {
    return { method, body } as Parameters<typeof press>[0];
  }
  function mockRes() {
    const res = { statusCode: 200 } as { statusCode: number; body?: unknown } & Record<string, unknown>;
    res.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    res.setHeader = () => res;
    res.json = (body: unknown) => {
      res.body = body;
      return res;
    };
    return res as unknown as Parameters<typeof press>[1] & { statusCode: number; body: unknown };
  }

  beforeAll(async () => {
    const neonModule = await import("@neondatabase/serverless");
    sql = neonModule.neon(process.env.DATABASE_URL as string);
    admin = (await import("./admin")).default;
    press = (await import("./press")).default;
    state = (await import("./state")).default;

    // Start from a genuinely sealed state — these tests own the shared
    // game_state row for their duration, same assumption admin.spec.ts makes
    // about the chain-side contract.
    await sql`UPDATE game_state SET started=false, started_at=NULL, deadline=NULL, total_presses=0, closest_call_seconds=NULL, closest_call_username=NULL, last_presser_username=NULL, last_press_faction=NULL, last_press_remaining_seconds=NULL, reset_count=0 WHERE id=1`;
  });

  afterAll(async () => {
    await sql`DELETE FROM presses WHERE username_lower LIKE ${TEST_PREFIX + "%"}`;
    await sql`UPDATE game_state SET started=false, started_at=NULL, deadline=NULL, total_presses=0, closest_call_seconds=NULL, closest_call_username=NULL, last_presser_username=NULL, last_press_faction=NULL, last_press_remaining_seconds=NULL, reset_count=0 WHERE id=1`;
  });

  it("rejects a press before the game has started", async () => {
    const res = mockRes();
    await press(mockReq("POST", { username: testUsername("early") }), res);
    expect(res.statusCode).toBe(409);
    expect((res.body as { error: string }).error).toBe("NOT_STARTED");
  });

  it("start activates the game exactly once", async () => {
    const res = mockRes();
    await admin(mockReq("POST", { action: "start" }), res);
    expect(res.statusCode).toBe(200);

    const again = mockRes();
    await admin(mockReq("POST", { action: "start" }), again);
    expect(again.statusCode).toBe(409);
    expect((again.body as { error: string }).error).toBe("ALREADY_STARTED");
  });

  it("accepts a press, assigns a faction, and rejects the same username again — case-insensitively", async () => {
    const username = testUsername("Alpha");
    const first = mockRes();
    await press(mockReq("POST", { username }), first);
    expect(first.statusCode).toBe(200);
    const body = first.body as { faction: number; remainingSeconds: number; pressNumber: number };
    expect(body.faction).toBe(1); // pressed immediately after start -> ~60s remaining -> PURPLE
    expect(body.remainingSeconds).toBeGreaterThanOrEqual(55);

    const dupe = mockRes();
    await press(mockReq("POST", { username: username.toLowerCase() }), dupe);
    expect(dupe.statusCode).toBe(409);
    expect((dupe.body as { error: string }).error).toBe("ALREADY_PRESSED");
  });

  it("rejects a malformed username without touching the database", async () => {
    const res = mockRes();
    await press(mockReq("POST", { username: "a" }), res); // too short
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("INVALID_USERNAME");
  });

  it("reset pushes the deadline forward and rejects once the game is no longer alive", async () => {
    const ok = mockRes();
    await admin(mockReq("POST", { action: "reset" }), ok);
    expect(ok.statusCode).toBe(200);

    await sql`UPDATE game_state SET deadline = now() - interval '1 second' WHERE id = 1`;

    const rejected = mockRes();
    await admin(mockReq("POST", { action: "reset" }), rejected);
    expect(rejected.statusCode).toBe(409);
    expect((rejected.body as { error: string }).error).toBe("NOT_ALIVE");

    const pressAfterDeath = mockRes();
    await press(mockReq("POST", { username: testUsername("too_late") }), pressAfterDeath);
    expect(pressAfterDeath.statusCode).toBe(409);
    expect((pressAfterDeath.body as { error: string }).error).toBe("ENDED");
  });

  it("state reflects everything the above did", async () => {
    const res = mockRes();
    await state(mockReq("GET"), res);
    const body = res.body as { started: boolean; alive: boolean; totalPresses: number; lastPresserUsername: string };
    expect(body.started).toBe(true);
    expect(body.alive).toBe(false);
    expect(body.totalPresses).toBe(1);
    expect(body.lastPresserUsername?.toLowerCase()).toBe(testUsername("alpha"));
  });
});

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS, signSession } from "./_adminSession.js";

/** Checks the operator's username/password against ADMIN_BASIC_AUTH_USER/
 *  ADMIN_BASIC_AUTH_PASSWORD (unchanged from the old Basic Auth setup — same
 *  env vars, just checked here instead of by the browser) and, on a match,
 *  issues the signed session cookie web/middleware.ts looks for. Reachable
 *  without a session because middleware's matcher only covers the exact paths
 *  /admin and /api/admin, not this one. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  const expectedUser = process.env.ADMIN_BASIC_AUTH_USER;
  const expectedPassword = process.env.ADMIN_BASIC_AUTH_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!expectedUser || !expectedPassword || !secret) {
    res.status(503).json({ error: "ADMIN_AUTH_NOT_CONFIGURED" });
    return;
  }

  const { username, password } = (req.body ?? {}) as { username?: unknown; password?: unknown };
  if (username !== expectedUser || password !== expectedPassword) {
    res.status(401).json({ error: "INVALID_CREDENTIALS" });
    return;
  }

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = await signSession(secret, expiresAt);
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  );
  res.status(200).json({ ok: true });
}

import { SESSION_COOKIE_NAME, readCookie, verifySession } from "./api/_adminSession.js";
import { renderAdminLoginPage } from "./api/_adminLoginPage.js";

export const config = {
  matcher: ["/admin", "/api/admin"]
};

/**
 * Vercel Edge Middleware — runs before the SPA rewrite in web/vercel.json, so an
 * unauthenticated request to /admin never receives index.html or any part of the
 * JS bundle. This is a real, server-side gate (the credentials never ship to the
 * client), not the client-side "hide a button" trick that a curious visitor could
 * bypass by reading the page's own source. Auth is a signed session cookie set by
 * POST /api/admin-login (see api/admin-login.ts and api/_adminSession.ts) rather
 * than HTTP Basic Auth, so the sign-in screen can be a themed page instead of the
 * browser's own unstylable prompt. /api/admin (the database-backed start()/
 * resetTimer() equivalent, see api/admin.ts) is covered by the same matcher, so
 * the same cookie that unlocks /admin also authorizes its fetch()es to /api/admin.
 *
 * This is a SEPARATE, additive layer on top of the contract's own `onlyStarter`
 * check, not a replacement for it — see AdminPage.tsx and SECURITY.md. Even a
 * visitor who somehow gets past this gate still can't make the real onchain
 * start()/resetTimer() succeed from any wallet but the real starter's; the
 * contract enforces that itself, unconditionally. What this middleware adds is
 * keeping the operator UI (and now the database admin actions it drives) off
 * crawlers, link previews, and anyone just guessing/finding the URL.
 *
 * Fails closed: if ADMIN_SESSION_SECRET isn't set on this deployment, /admin and
 * /api/admin both stay fully blocked rather than silently falling open.
 */
export default async function middleware(request: Request): Promise<Response | undefined> {
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (secret) {
    const cookie = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
    if (await verifySession(secret, cookie)) {
      return undefined;
    }
  }

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/admin")) {
    return new Response(JSON.stringify({ error: "UNAUTHENTICATED" }), {
      status: 401,
      headers: { "content-type": "application/json" }
    });
  }

  return new Response(renderAdminLoginPage(), {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

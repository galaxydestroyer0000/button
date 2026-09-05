export const config = {
  matcher: ["/admin", "/api/admin"]
};

/**
 * Vercel Edge Middleware — runs before the SPA rewrite in web/vercel.json, so an
 * unauthenticated request to /admin never receives index.html or any part of the
 * JS bundle. This is a real, server-side gate (the credentials never ship to the
 * client), not the client-side "hide a button" trick that a curious visitor could
 * bypass by reading the page's own source. /api/admin (the database-backed
 * start()/resetTimer() equivalent, see api/admin.ts) is covered by the same
 * matcher and the same realm, so a browser that already authenticated to load
 * /admin sends the cached credentials on its fetch()es to /api/admin too — no
 * separate login step needed.
 *
 * This is a SEPARATE, additive layer on top of the contract's own `onlyStarter`
 * check, not a replacement for it — see AdminPage.tsx and SECURITY.md. Even a
 * visitor who somehow gets past this gate still can't make the real onchain
 * start()/resetTimer() succeed from any wallet but the real starter's; the
 * contract enforces that itself, unconditionally. What this middleware adds is
 * keeping the operator UI (and now the database admin actions it drives) off
 * crawlers, link previews, and anyone just guessing/finding the URL.
 *
 * Fails closed: if the two env vars below aren't set on this deployment,
 * /admin and /api/admin both stay fully blocked rather than silently falling
 * open.
 */
export default function middleware(request: Request): Response | undefined {
  const expectedUser = process.env.ADMIN_BASIC_AUTH_USER;
  const expectedPassword = process.env.ADMIN_BASIC_AUTH_PASSWORD;

  if (expectedUser && expectedPassword) {
    const credentials = parseBasicAuth(request.headers.get("authorization"));
    if (credentials && credentials.user === expectedUser && credentials.password === expectedPassword) {
      return undefined;
    }
  }

  return new Response("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="admin", charset="UTF-8"' }
  });
}

function parseBasicAuth(header: string | null): { user: string; password: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length));
  } catch {
    return null;
  }
  const separator = decoded.indexOf(":");
  if (separator === -1) return null;
  return { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

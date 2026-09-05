import { afterEach, describe, expect, it } from "vitest";
import middleware from "./middleware";
import { SESSION_COOKIE_NAME, signSession } from "./api/_adminSession";

function requestTo(path: string, cookie?: string): Request {
  const headers = new Headers();
  if (cookie !== undefined) headers.set("cookie", cookie);
  return new Request(`https://example.com${path}`, { headers });
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("admin middleware", () => {
  afterEach(() => {
    delete process.env.ADMIN_SESSION_SECRET;
  });

  it("fails closed when no session secret is configured on the deployment, even for a request with no cookie at all", async () => {
    const response = await middleware(requestTo("/admin"));
    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(401);
  });

  it("rejects a request with no session cookie once a secret is configured, serving the themed login page for /admin", async () => {
    process.env.ADMIN_SESSION_SECRET = "test-secret";
    const response = await middleware(requestTo("/admin"));
    expect(response?.status).toBe(401);
    expect(response?.headers.get("content-type")).toContain("text/html");
    const body = await response?.text();
    expect(body).toContain("Sign in");
  });

  it("rejects /api/admin with a JSON 401 instead of the HTML login page", async () => {
    process.env.ADMIN_SESSION_SECRET = "test-secret";
    const response = await middleware(requestTo("/api/admin"));
    expect(response?.status).toBe(401);
    expect(response?.headers.get("content-type")).toContain("application/json");
    expect(await response?.json()).toEqual({ error: "UNAUTHENTICATED" });
  });

  it("rejects a cookie signed with a different secret", async () => {
    process.env.ADMIN_SESSION_SECRET = "test-secret";
    const token = await signSession("some-other-secret", Date.now() + 60_000);
    const response = await middleware(requestTo("/admin", sessionCookie(token)));
    expect(response?.status).toBe(401);
  });

  it("rejects an expired session cookie", async () => {
    process.env.ADMIN_SESSION_SECRET = "test-secret";
    const token = await signSession("test-secret", Date.now() - 1_000);
    const response = await middleware(requestTo("/admin", sessionCookie(token)));
    expect(response?.status).toBe(401);
  });

  it("rejects a malformed cookie instead of throwing", async () => {
    process.env.ADMIN_SESSION_SECRET = "test-secret";
    const response = await middleware(requestTo("/admin", `${SESSION_COOKIE_NAME}=garbage`));
    expect(response?.status).toBe(401);
  });

  it("lets the request through (returns undefined) with a validly signed, unexpired session cookie", async () => {
    process.env.ADMIN_SESSION_SECRET = "test-secret";
    const token = await signSession("test-secret", Date.now() + 60_000);
    const response = await middleware(requestTo("/admin", sessionCookie(token)));
    expect(response).toBeUndefined();
  });
});

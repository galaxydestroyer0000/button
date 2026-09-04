import { afterEach, describe, expect, it } from "vitest";
import middleware from "./middleware";

function requestWithAuth(header?: string): Request {
  const headers = new Headers();
  if (header !== undefined) headers.set("authorization", header);
  return new Request("https://example.com/admin", { headers });
}

function basicHeader(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

describe("admin middleware", () => {
  afterEach(() => {
    delete process.env.ADMIN_BASIC_AUTH_USER;
    delete process.env.ADMIN_BASIC_AUTH_PASSWORD;
  });

  it("fails closed when no credentials are configured on the deployment, even for a request with no auth header at all", async () => {
    const response = await middleware(requestWithAuth());
    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(401);
  });

  it("rejects a request with no Authorization header once credentials are configured", async () => {
    process.env.ADMIN_BASIC_AUTH_USER = "operator";
    process.env.ADMIN_BASIC_AUTH_PASSWORD = "correct-horse";
    const response = await middleware(requestWithAuth());
    expect(response?.status).toBe(401);
    expect(response?.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("rejects the wrong password for the right username", async () => {
    process.env.ADMIN_BASIC_AUTH_USER = "operator";
    process.env.ADMIN_BASIC_AUTH_PASSWORD = "correct-horse";
    const response = await middleware(requestWithAuth(basicHeader("operator", "wrong")));
    expect(response?.status).toBe(401);
  });

  it("rejects a malformed Authorization header instead of throwing", async () => {
    process.env.ADMIN_BASIC_AUTH_USER = "operator";
    process.env.ADMIN_BASIC_AUTH_PASSWORD = "correct-horse";
    const response = await middleware(requestWithAuth("Bearer not-even-basic"));
    expect(response?.status).toBe(401);
    const garbage = await middleware(requestWithAuth("Basic %%%not-base64%%%"));
    expect(garbage?.status).toBe(401);
  });

  it("lets the request through (returns undefined) with the exact configured credentials", async () => {
    process.env.ADMIN_BASIC_AUTH_USER = "operator";
    process.env.ADMIN_BASIC_AUTH_PASSWORD = "correct-horse";
    const response = await middleware(requestWithAuth(basicHeader("operator", "correct-horse")));
    expect(response).toBeUndefined();
  });
});

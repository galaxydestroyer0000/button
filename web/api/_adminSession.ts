export const SESSION_COOKIE_NAME = "admin_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Shared by web/middleware.ts (Edge runtime) and the admin-login/admin-logout
 *  functions (Node runtime) — built only on Web Crypto and btoa/atob, which
 *  both runtimes provide natively, so this one module works unmodified in
 *  either place. The session cookie itself is just a signed expiry: an HMAC
 *  proves this server issued it, and nothing else needs to be stored. */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify"
  ]);
}

export async function signSession(secret: string, expiresAt: number): Promise<string> {
  const key = await hmacKey(secret);
  const payload = String(expiresAt);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifySession(secret: string, token: string | null): Promise<boolean> {
  if (!token) return false;
  const separator = token.indexOf(".");
  if (separator === -1) return false;
  const payload = token.slice(0, separator);
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  try {
    const key = await hmacKey(secret);
    return await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(token.slice(separator + 1)) as BufferSource,
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

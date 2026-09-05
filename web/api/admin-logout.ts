import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SESSION_COOKIE_NAME } from "./_adminSession.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  res.setHeader("Set-Cookie", `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  res.status(200).json({ ok: true });
}

import { useEffect } from "react";

const DEFAULT_TITLE = "BUTTON / RDDT — One press forever";
const DEFAULT_DESCRIPTION = "A shared 60-second clock on Robinhood Chain. One wallet gets one press, ever. At zero, it ends forever.";

function setMeta(selector: string, attr: "content", value: string) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

/**
 * Updates the document title and OpenGraph/Twitter meta tags for the current route.
 * This only helps a crawler that actually executes JavaScript (some link-preview
 * bots do) and the browser tab itself — it does NOT help Twitter/Discord/iMessage,
 * which fetch the page once and never run its scripts. Those get real per-press/
 * per-wallet tags from the Vercel Edge Function at web/api/og.ts instead. This hook
 * exists for the case that function doesn't cover (self-hosted off Vercel, or a
 * crawler this app can't distinguish from a browser) and to keep the tab title honest.
 */
export function usePageMeta(meta: { title?: string; description?: string; image?: string } | null) {
  useEffect(() => {
    const title = meta?.title ? `${meta.title} · BUTTON / RDDT` : DEFAULT_TITLE;
    const description = meta?.description ?? DEFAULT_DESCRIPTION;
    const image = meta?.image ?? "/assets/button-token.webp";

    document.title = title;
    setMeta('meta[property="og:title"]', "content", meta?.title ?? "BUTTON — one wallet, one press, forever");
    setMeta('meta[name="twitter:title"]', "content", meta?.title ?? "BUTTON — one wallet, one press, forever");
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[name="twitter:description"]', "content", description);
    setMeta('meta[property="og:image"]', "content", image);
    setMeta('meta[name="twitter:image"]', "content", image);

    return () => {
      document.title = DEFAULT_TITLE;
      setMeta('meta[property="og:title"]', "content", "BUTTON — one wallet, one press, forever");
      setMeta('meta[name="twitter:title"]', "content", "BUTTON — one wallet, one press, forever");
      setMeta('meta[property="og:description"]', "content", DEFAULT_DESCRIPTION);
      setMeta('meta[name="twitter:description"]', "content", DEFAULT_DESCRIPTION);
      setMeta('meta[property="og:image"]', "content", "/assets/button-token.webp");
      setMeta('meta[name="twitter:image"]', "content", "/assets/button-token.webp");
    };
  }, [meta?.title, meta?.description, meta?.image]);
}

export function shortAddress(value: string | undefined | null): string {
  if (!value || value.length < 10) return "N/A";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "N/A";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export function relativeTime(timestampSeconds: number, nowMs: number): string {
  const diff = Math.max(0, Math.floor(nowMs / 1000 - timestampSeconds));
  if (diff < 5) return "NOW";
  if (diff < 60) return `${diff}s AGO`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m AGO`;
  return `${Math.floor(diff / 3600)}h AGO`;
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = [
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty"];

/** Spells out 0-60 in words — the only range a press's `remaining` can ever be.
 *  Used for the identity card's "I waited until {word}." line. */
export function numberToWord(n: number): string {
  if (n < 0 || n > 60 || !Number.isInteger(n)) return String(n);
  if (n === 60) return "sixty";
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? TENS[tens] : `${TENS[tens]}-${ONES[ones]}`;
}

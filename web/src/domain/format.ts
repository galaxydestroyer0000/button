export function shortAddress(value: string | undefined | null): string {
  if (!value || value.length < 10) return "—";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
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

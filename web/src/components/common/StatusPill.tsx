import styles from "./StatusPill.module.css";

export type StatusTone = "" | "live" | "dead" | "stale";

export default function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <div className={styles.line} aria-live="polite">
      <span className={`${styles.dot} ${tone ? styles[tone] : ""}`} />
      <span>{label}</span>
    </div>
  );
}

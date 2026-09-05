import { useEffect, useState } from "react";
import { FACTIONS } from "../../domain/factions";
import { relativeTime } from "../../domain/format";
import type { HistoryRowData } from "../../hooks/useHistoryPage";
import styles from "./HistoryRow.module.css";

export default function HistoryRow({ event }: { event: HistoryRowData }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const faction = FACTIONS[event.faction] ?? FACTIONS[0];
  const timestampSeconds = new Date(event.pressedAt).getTime() / 1000;

  return (
    <div className={styles.row}>
      <span className={styles.no}>#{event.pressNumber}</span>
      <span className={styles.username}>{event.username}</span>
      <span className={styles.seconds}>{event.remainingSeconds}s</span>
      <span className={styles.chip} style={{ ["--chip" as string]: faction.color }}>
        {faction.name}
      </span>
      <span className={styles.ago}>{relativeTime(timestampSeconds, now)}</span>
    </div>
  );
}

import { useEffect, useState } from "react";
import { FACTIONS } from "../../domain/factions";
import { relativeTime, shortAddress } from "../../domain/format";
import { txUrl } from "../../config/network";
import { runtimeConfig } from "../../config/runtimeConfig";
import type { PressEvent } from "../../domain/types";
import styles from "./FeedRow.module.css";

export default function FeedRow({ event, isNew }: { event: PressEvent; isNew: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const faction = FACTIONS[event.faction] ?? FACTIONS[0];

  return (
    <div className={`${styles.row} ${isNew ? styles.flash : ""}`}>
      <span className={styles.no}>#{event.pressNumber}</span>
      <span className={styles.wallet}>{shortAddress(event.presser)}</span>
      <span className={styles.seconds}>{event.remaining}s</span>
      <span className={styles.chip} style={{ ["--chip" as string]: faction.color }}>
        {faction.name}
      </span>
      <span className={styles.ago}>{relativeTime(event.timestamp, now)}</span>
      {event.txHash ? (
        <a
          className={styles.link}
          href={txUrl(runtimeConfig.network.explorer, event.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View press transaction"
        >
          ↗
        </a>
      ) : (
        <span />
      )}
    </div>
  );
}

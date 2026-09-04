import { Link } from "react-router-dom";
import { FACTIONS } from "../../domain/factions";
import { shortAddress } from "../../domain/format";
import type { PressEvent } from "../../domain/types";
import styles from "./PressListRow.module.css";

export default function PressListRow({ event, badge }: { event: PressEvent; badge?: string }) {
  const f = FACTIONS[event.faction] ?? FACTIONS[0];
  return (
    <Link to={`/press/${event.pressNumber}`} className={styles.row} style={{ ["--fc" as string]: f.color }}>
      <span className={styles.pressNumber}>#{event.pressNumber.toLocaleString()}</span>
      <span className={styles.seconds}>{event.remaining}s</span>
      <span className={styles.faction}>{f.name}</span>
      <span className={styles.wallet}>{shortAddress(event.presser)}</span>
      {badge && <span className={styles.badge}>{badge}</span>}
    </Link>
  );
}

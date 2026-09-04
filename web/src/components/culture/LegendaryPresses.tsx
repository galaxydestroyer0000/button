import PressListRow from "./PressListRow";
import type { PressEvent } from "../../domain/types";
import styles from "./PressList.module.css";

/**
 * The "closest possible calls" tier — remaining is a whole-second integer that can
 * never reach 0 (pressing exactly at the deadline reverts), so 1-2 seconds is the
 * practical, honest ceiling for "legendary" rather than a fabricated "under 1s".
 */
export default function LegendaryPresses({ events }: { events: PressEvent[] }) {
  if (events.length === 0) {
    return <div className={styles.empty}>NOBODY HAS PRESSED THAT CLOSE TO THE END YET.</div>;
  }
  return (
    <div className={styles.list}>
      {events.map((event) => (
        <PressListRow key={event.key} event={event} badge={`${event.remaining}s TO ZERO`} />
      ))}
    </div>
  );
}

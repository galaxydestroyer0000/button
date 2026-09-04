import PressListRow from "./PressListRow";
import type { PressEvent } from "../../domain/types";
import styles from "./PressList.module.css";

/** The closest calls ever recorded, closest first. */
export default function HallOfFame({ events }: { events: PressEvent[] }) {
  if (events.length === 0) {
    return <div className={styles.empty}>NO PRESSES RECORDED YET.</div>;
  }
  return (
    <div className={styles.list}>
      {events.map((event, i) => (
        <PressListRow key={event.key} event={event} badge={i === 0 ? "CLOSEST EVER" : undefined} />
      ))}
    </div>
  );
}

import PressListRow from "./PressListRow";
import type { Milestone } from "../../hooks/useMilestones";
import styles from "./PressList.module.css";

function milestoneLabel(pressNumber: number): string {
  return pressNumber === 1 ? "THE FIRST PRESS" : `THE ${pressNumber.toLocaleString()}TH PRESS`;
}

/** Round-number presses the experiment has actually reached — never a projected or
 *  upcoming one, only ones the contract's own totalPresses confirms happened. */
export default function Milestones({ milestones }: { milestones: Milestone[] }) {
  const resolved = milestones.filter((m): m is Milestone & { event: NonNullable<Milestone["event"]> } => m.event !== null);
  if (resolved.length === 0) {
    return <div className={styles.empty}>NO MILESTONES REACHED YET.</div>;
  }
  return (
    <div className={styles.list}>
      {resolved.map((m) => (
        <PressListRow key={m.pressNumber} event={m.event} badge={milestoneLabel(m.pressNumber)} />
      ))}
    </div>
  );
}

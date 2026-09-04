import { FACTIONS } from "../../domain/factions";
import type { PressEvent } from "../../domain/types";
import styles from "./GlobalPulse.module.css";

/**
 * A subtle, app-wide glow that fires once whenever `pulseEvent` changes to a new,
 * genuinely-just-detected press (never on the initial historical backfill — see
 * useEventSync's pulseEvent gating). Keying the element by the event's own key makes
 * React remount it fresh each time, which is what (re)starts the CSS animation — no
 * manual timer bookkeeping needed.
 */
export default function GlobalPulse({ pulseEvent }: { pulseEvent: PressEvent | null }) {
  if (!pulseEvent) return null;
  const color = FACTIONS[pulseEvent.faction]?.color ?? FACTIONS[0].color;
  return <div key={pulseEvent.key} className={styles.pulse} style={{ ["--pulse-color" as string]: color }} aria-hidden="true" />;
}

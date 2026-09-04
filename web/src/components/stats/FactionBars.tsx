import { FACTIONS } from "../../domain/factions";
import type { PressEvent } from "../../domain/types";
import styles from "./FactionBars.module.css";

export default function FactionBars({
  counts,
  total,
  pulseEvent
}: {
  counts: readonly number[];
  total: number;
  /** The most recently *detected* press (never set for the initial historical
   *  backfill — see useEventSync). Only its own faction row briefly animates. */
  pulseEvent?: PressEvent | null;
}) {
  return (
    <div className={styles.list}>
      {[1, 2, 3, 4, 5, 6].map((i) => {
        const f = FACTIONS[i];
        const count = counts[i] || 0;
        const pct = total ? (count / total) * 100 : 0;
        const isPulseTarget = pulseEvent?.faction === i;
        return (
          <div
            // Keying the highlighted row by the pulse's own identity forces a fresh
            // mount exactly when a new press for THIS faction lands, replaying the
            // CSS highlight animation once — every other row keeps a stable key and
            // never remounts, so the highlight never sticks or plays for the wrong row.
            key={isPulseTarget ? `${i}-${pulseEvent!.key}` : i}
            className={`${styles.row} ${isPulseTarget ? styles.highlight : ""}`}
            style={{ ["--fc" as string]: f.color }}
          >
            <span className={styles.swatch} />
            <span className={styles.name}>{f.name}</span>
            <span className={styles.range}>{f.range}</span>
            {/* Decorative — the adjacent count/percent text already carries this
                information, and a plain <span>'s implicit "generic" role prohibits
                aria-label (it's not a naming-capable role), so labeling it would be
                both redundant and invalid ARIA. */}
            <span className={styles.bar} aria-hidden="true">
              <i style={{ ["--pct" as string]: `${pct.toFixed(2)}%` }} />
            </span>
            <span className={styles.count}>
              {count} · {pct.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

import { FACTIONS } from "../../domain/factions";
import styles from "./FactionBars.module.css";

export default function FactionBars({ counts, total }: { counts: readonly number[]; total: number }) {
  return (
    <div className={styles.list}>
      {[1, 2, 3, 4, 5, 6].map((i) => {
        const f = FACTIONS[i];
        const count = counts[i] || 0;
        const pct = total ? (count / total) * 100 : 0;
        return (
          <div key={i} className={styles.row} style={{ ["--fc" as string]: f.color }}>
            <span className={styles.swatch} />
            <span className={styles.name}>{f.name}</span>
            <span className={styles.range}>{f.range}</span>
            <span className={styles.bar} aria-label={`${f.name} ${pct.toFixed(1)} percent`}>
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

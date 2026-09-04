import { FACTIONS } from "../../domain/factions";
import styles from "./FactionLeaderboard.module.css";

/**
 * Factions ranked by participant count — nothing else. No token ownership, no
 * weighting, no reward. A wallet either pressed in that window or it didn't.
 */
export default function FactionLeaderboard({ counts }: { counts: readonly number[] }) {
  const ranked = [1, 2, 3, 4, 5, 6]
    .map((id) => ({ faction: FACTIONS[id], count: counts[id] || 0 }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className={styles.list}>
      {ranked.map((row, i) => (
        <div key={row.faction.id} className={styles.row} style={{ ["--fc" as string]: row.faction.color }}>
          <span className={styles.rank}>#{i + 1}</span>
          <span className={styles.swatch} />
          <span className={styles.name}>{row.faction.name}</span>
          <span className={styles.seed}>{row.faction.seed}</span>
          <span className={styles.count}>{row.count.toLocaleString()} PRESSER{row.count === 1 ? "" : "S"}</span>
        </div>
      ))}
    </div>
  );
}

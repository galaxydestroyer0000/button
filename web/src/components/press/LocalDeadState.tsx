import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FACTIONS } from "../../domain/factions";
import { formatDuration } from "../../domain/format";
import FactionBars from "../stats/FactionBars";
import type { GameState } from "../../hooks/useGameState";
import styles from "./DeadState.module.css";

/**
 * The permanent end, database-backed edition — same "no way back" as the
 * onchain original (see DeadState.tsx, still used by the /admin-controlled
 * real contract), just reading state.ts's fields instead of chain events.
 */
export default function LocalDeadState({ state }: { state: GameState }) {
  const totalPresses = state.totalPresses;
  const durationSurvived = state.startedAt && state.deadlineMs ? Math.max(0, (state.deadlineMs - state.startedAt) / 1000) : 0;

  const factionCounts = useFactionCounts();

  return (
    <section className={styles.dead} aria-label="The experiment has ended">
      <div className={styles.timer}>00.00</div>
      <div className={styles.headline}>THE BUTTON IS DEAD</div>
      <div className={styles.subhead}>No admin reset. No pause. No restart. This is the permanent state.</div>

      <div className={styles.facts}>
        <div>
          <span>FINAL PRESS</span>
          <strong>{totalPresses ? `#${totalPresses.toLocaleString()}` : "—"}</strong>
        </div>
        <div>
          <span>FINAL PRESSER</span>
          <strong>{state.lastPresserUsername || "no one ever pressed"}</strong>
        </div>
        <div>
          <span>TOTAL PRESSES</span>
          <strong>{totalPresses.toLocaleString()}</strong>
        </div>
        <div>
          <span>DURATION SURVIVED</span>
          <strong>{formatDuration(durationSurvived)}</strong>
        </div>
        <div>
          <span>CLOSEST CALL</span>
          <strong>
            {totalPresses ? `${state.closestCallSeconds}s` : "—"}
            {state.closestCallUsername ? ` — ${state.closestCallUsername}` : ""}
          </strong>
        </div>
        {state.lastPressFaction != null && (
          <div>
            <span>FINAL PRESS FACTION</span>
            <strong style={{ color: FACTIONS[state.lastPressFaction]?.color }}>{FACTIONS[state.lastPressFaction]?.name}</strong>
          </div>
        )}
      </div>

      <div className={styles.factionBlock}>
        <span className={styles.eyebrow}>FACTION DISTRIBUTION</span>
        <FactionBars counts={factionCounts} total={totalPresses} />
      </div>

      <Link to="/history" className={styles.historyLink}>
        COMPLETE HISTORY REMAINS ACCESSIBLE →
      </Link>
    </section>
  );
}

// Faction totals aren't part of /api/state (that endpoint is polled every
// 2.5s; a GROUP BY query belongs in /api/stats, fetched once here instead).
function useFactionCounts(): readonly number[] {
  const [counts, setCounts] = useState<readonly number[]>([0, 0, 0, 0, 0, 0, 0]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const next = [0, 0, 0, 0, 0, 0, 0];
        for (const [faction, count] of Object.entries(data.factionCounts || {})) {
          next[Number(faction)] = count as number;
        }
        setCounts(next);
      })
      .catch(() => {
        // Leave zeros — the facts panel above already shows the real totals.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return counts;
}

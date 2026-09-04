import { Link } from "react-router-dom";
import { FACTIONS } from "../../domain/factions";
import { formatDuration, shortAddress } from "../../domain/format";
import { runtimeConfig } from "../../config/runtimeConfig";
import { usePressByNumber } from "../../hooks/usePressByNumber";
import FactionBars from "../stats/FactionBars";
import type { ExperimentState } from "../../domain/types";
import type { EventSyncStatus } from "../../hooks/useEventSync";
import type { PreviewClockState } from "../../hooks/usePreviewClock";
import styles from "./DeadState.module.css";

/**
 * The permanent end. Not a status label — a different screen, deliberately without
 * a way back. No restart, no "season 2", no revival: the contract itself has no
 * such function, and neither does this.
 */
export default function DeadState({ state, sync, preview }: { state: ExperimentState; sync: EventSyncStatus; preview: PreviewClockState }) {
  const finalPressNumber = runtimeConfig.previewMode ? preview.total : state.totalPresses;
  const finalLookup = usePressByNumber(sync, finalPressNumber, state.totalPresses);
  const finalPress = runtimeConfig.previewMode ? preview.events[0] ?? null : finalLookup.event;

  const finalPresser = runtimeConfig.previewMode ? finalPress?.presser ?? "" : state.lastPresser;
  const totalPresses = finalPressNumber;
  const closest = runtimeConfig.previewMode ? preview.closest : state.closestCall;
  const closestWallet = runtimeConfig.previewMode ? "" : state.closestCallWallet;
  const counts = runtimeConfig.previewMode ? preview.factionCounts : state.factionCounts;

  const startedAtMs = runtimeConfig.previewMode ? preview.startedAtMs : state.startedAt * 1000;
  const endedAtMs = runtimeConfig.previewMode ? preview.deadlineMs : state.deadline * 1000;
  const durationSurvived = Math.max(0, (endedAtMs - startedAtMs) / 1000);

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
          <strong>{finalPresser ? shortAddress(finalPresser) : "no one ever pressed"}</strong>
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
            {totalPresses ? `${closest}s` : "—"}
            {closestWallet ? ` — ${shortAddress(closestWallet)}` : ""}
          </strong>
        </div>
        {finalPress && (
          <div>
            <span>FINAL PRESS FACTION</span>
            <strong style={{ color: FACTIONS[finalPress.faction]?.color }}>{FACTIONS[finalPress.faction]?.name}</strong>
          </div>
        )}
      </div>

      <div className={styles.factionBlock}>
        <span className={styles.eyebrow}>FACTION DISTRIBUTION</span>
        <FactionBars counts={counts} total={totalPresses} />
      </div>

      {!runtimeConfig.previewMode && (
        <Link to="/history" className={styles.historyLink}>
          COMPLETE HISTORY REMAINS ACCESSIBLE →
        </Link>
      )}
    </section>
  );
}

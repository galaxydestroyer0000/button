import { FACTIONS } from "../domain/factions";
import { formatDuration, shortAddress } from "../domain/format";
import { runtimeConfig } from "../config/runtimeConfig";
import { useCountdown } from "../hooks/useCountdown";
import { useWindowCounts } from "../hooks/useWindowCounts";
import { useHourlyBuckets } from "../hooks/useHourlyBuckets";
import { useLiveFeed } from "../hooks/useLiveFeed";
import { useClosestCalls } from "../hooks/useClosestCalls";
import { useLegendaryPresses } from "../hooks/useLegendaryPresses";
import { useMilestones } from "../hooks/useMilestones";
import StatTile from "../components/stats/StatTile";
import FactionBars from "../components/stats/FactionBars";
import HourlyChart from "../components/stats/HourlyChart";
import FactionLeaderboard from "../components/culture/FactionLeaderboard";
import HallOfFame from "../components/culture/HallOfFame";
import LegendaryPresses from "../components/culture/LegendaryPresses";
import Milestones from "../components/culture/Milestones";
import type { ExperimentState } from "../domain/types";
import type { EventSyncStatus } from "../hooks/useEventSync";
import type { PreviewClockState } from "../hooks/usePreviewClock";
import styles from "./StatsPage.module.css";

const LEGENDARY_MAX_SECONDS = 2;

export default function StatsPage({ state, sync, preview }: { state: ExperimentState; sync: EventSyncStatus; preview: PreviewClockState }) {
  const windowCounts = useWindowCounts(sync);
  const hourlyBuckets = useHourlyBuckets(sync);
  const recent = useLiveFeed(sync, 1);
  const latest = runtimeConfig.previewMode ? preview.events[0] : recent[0];
  const closestCalls = useClosestCalls(sync, 10);
  const legendary = useLegendaryPresses(sync, LEGENDARY_MAX_SECONDS);
  const milestones = useMilestones(sync, runtimeConfig.previewMode ? 0 : state.totalPresses);

  const deadlineMs = runtimeConfig.previewMode ? preview.deadlineMs : state.loaded ? state.deadline * 1000 - state.chainOffsetMs : null;
  const alive = runtimeConfig.previewMode ? preview.deadlineMs > Date.now() : state.started && state.alive;
  const reading = useCountdown(deadlineMs, { sealed: !runtimeConfig.previewMode && !state.started, alive });

  const total = runtimeConfig.previewMode ? preview.total : state.totalPresses;
  const closest = runtimeConfig.previewMode ? preview.closest : state.closestCall;
  const closestWallet = runtimeConfig.previewMode ? "" : state.closestCallWallet;
  const counts = runtimeConfig.previewMode ? preview.factionCounts : state.factionCounts;

  const ageSeconds = runtimeConfig.previewMode
    ? (Math.min(Date.now(), preview.deadlineMs) - preview.startedAtMs) / 1000
    : state.started
      ? Math.max(0, (state.alive ? Date.now() + state.chainOffsetMs : state.deadline * 1000) / 1000 - state.startedAt)
      : NaN;

  const latestFaction = latest ? FACTIONS[latest.faction] : null;

  return (
    <section className={styles.section} aria-label="Richer experiment statistics">
      <div className={styles.head}>
        <span className={styles.eyebrow}>STATS</span>
        <h2>Every number here is read from the chain.</h2>
        <p>No invented volume, user counts, or market metrics — only what the contract and its own event history can prove.</p>
      </div>

      <div className={styles.grid}>
        <StatTile
          label="TOTAL PRESSES"
          value={runtimeConfig.previewMode ? total.toLocaleString() : state.loaded ? total.toLocaleString() : "—"}
          caption="every successful press, ever"
        />
        <StatTile
          label="UNIQUE PRESSERS"
          value={runtimeConfig.previewMode ? total.toLocaleString() : state.loaded ? total.toLocaleString() : "—"}
          caption="one wallet = one press, always equal to total presses"
        />
        <StatTile
          label="CLOSEST CALL EVER"
          value={total ? `${closest}s` : "—"}
          caption={closestWallet ? shortAddress(closestWallet) : "lowest clock at press"}
        />
        <StatTile
          label="MOST RECENT PRESS"
          value={latest ? `${latest.remaining}s — ${latestFaction!.name}` : "—"}
          caption={latest ? shortAddress(latest.presser) : "no presses yet"}
        />
        <StatTile label="EXPERIMENT UPTIME" value={Number.isFinite(ageSeconds) ? formatDuration(ageSeconds) : "—"} caption="since activation" />
        <StatTile label="CURRENT COUNTDOWN" value={reading.label} caption="interpolated locally, resynced from chain" />
        <StatTile
          label="PRESSES · LAST HOUR"
          value={runtimeConfig.previewMode ? "—" : windowCounts.lastHour.toLocaleString()}
          caption="from indexed history"
        />
        <StatTile
          label="PRESSES · LAST 24H"
          value={runtimeConfig.previewMode ? "—" : windowCounts.last24h.toLocaleString()}
          caption="from indexed history"
        />
      </div>

      <div className={styles.sectionGap}>
        <span className={styles.eyebrow}>FACTION DISTRIBUTION</span>
        <div className={styles.spacer} />
        <FactionBars counts={counts} total={total} pulseEvent={sync.pulseEvent} />
      </div>

      <div className={styles.sectionGap}>
        {runtimeConfig.previewMode ? (
          <div className={styles.previewNotice}>PREVIEW MODE HAS NO INDEXED HISTORY · CONFIGURE A CONTRACT TO SEE REAL CHARTS</div>
        ) : (
          <HourlyChart buckets={hourlyBuckets} />
        )}
      </div>

      <div className={styles.sectionGap}>
        <span className={styles.eyebrow}>FACTION LEADERBOARD</span>
        <p className={styles.sectionNote}>Ranked by participant count only. No token ownership, no weighting.</p>
        <div className={styles.spacer} />
        <FactionLeaderboard counts={counts} />
      </div>

      <div className={styles.sectionGap}>
        <span className={styles.eyebrow}>CLOSEST-CALL HALL OF FAME</span>
        <div className={styles.spacer} />
        {runtimeConfig.previewMode ? (
          <div className={styles.previewNotice}>PREVIEW MODE HAS NO INDEXED HISTORY</div>
        ) : (
          <HallOfFame events={closestCalls} />
        )}
      </div>

      <div className={styles.sectionGap}>
        <span className={styles.eyebrow}>LEGENDARY — CLOSEST POSSIBLE CALLS</span>
        <p className={styles.sectionNote}>
          Remaining is a whole second, and 0 is unreachable — pressing exactly at the deadline reverts. {LEGENDARY_MAX_SECONDS}s or less is
          as close as anyone can ever get.
        </p>
        <div className={styles.spacer} />
        {runtimeConfig.previewMode ? (
          <div className={styles.previewNotice}>PREVIEW MODE HAS NO INDEXED HISTORY</div>
        ) : (
          <LegendaryPresses events={legendary} />
        )}
      </div>

      <div className={styles.sectionGap}>
        <span className={styles.eyebrow}>MILESTONES</span>
        <div className={styles.spacer} />
        {runtimeConfig.previewMode ? (
          <div className={styles.previewNotice}>PREVIEW MODE HAS NO INDEXED HISTORY</div>
        ) : (
          <Milestones milestones={milestones} />
        )}
      </div>
    </section>
  );
}

import { useMemo } from "react";
import { FACTIONS } from "../domain/factions";
import { formatDuration } from "../domain/format";
import { useCountdown } from "../hooks/useCountdown";
import { useGameState } from "../hooks/useGameState";
import { useStats } from "../hooks/useStats";
import { useAllPresses } from "../hooks/useAllPresses";
import { windowCounts, hourlyBuckets, closestCalls, legendaryPresses, milestones } from "../domain/statsDerivations";
import StatTile from "../components/stats/StatTile";
import FactionBars from "../components/stats/FactionBars";
import HourlyChart from "../components/stats/HourlyChart";
import FactionLeaderboard from "../components/culture/FactionLeaderboard";
import HallOfFame from "../components/culture/HallOfFame";
import LegendaryPresses from "../components/culture/LegendaryPresses";
import Milestones from "../components/culture/Milestones";
import styles from "./StatsPage.module.css";

const LEGENDARY_MAX_SECONDS = 2;

export default function StatsPage() {
  const state = useGameState();
  const stats = useStats();
  const { events, loaded: eventsLoaded } = useAllPresses();

  const nowSec = Math.floor(Date.now() / 1000);
  const counts = useMemo(() => windowCounts(events, nowSec), [events, nowSec]);
  const buckets = useMemo(() => hourlyBuckets(events, nowSec), [events, nowSec]);
  const closest = useMemo(() => closestCalls(events, 10), [events]);
  const legendary = useMemo(() => legendaryPresses(events, LEGENDARY_MAX_SECONDS), [events]);
  const milestoneList = useMemo(() => milestones(events, stats.totalPresses), [events, stats.totalPresses]);
  const latest = events.length > 0 ? events[events.length - 1] : null;
  const latestFaction = latest ? FACTIONS[latest.faction] : null;

  const factionCountsArray = useMemo(() => {
    const arr = [0, 0, 0, 0, 0, 0, 0];
    for (const [faction, count] of Object.entries(stats.factionCounts)) arr[Number(faction)] = count;
    return arr;
  }, [stats.factionCounts]);

  const reading = useCountdown(state.deadlineMs, { sealed: !state.started, alive: state.started && state.alive });

  return (
    <section className={styles.section} aria-label="Richer experiment statistics">
      <div className={styles.head}>
        <span className={styles.eyebrow}>STATS</span>
        <h2>Every number here is read from the database.</h2>
        <p>No invented volume, user counts, or market metrics — only what the server's own records can prove.</p>
      </div>

      <div className={styles.grid}>
        <StatTile label="TOTAL PRESSES" value={stats.loaded ? stats.totalPresses.toLocaleString() : "—"} caption="every successful press, ever" />
        <StatTile
          label="UNIQUE PRESSERS"
          value={stats.loaded ? stats.totalPresses.toLocaleString() : "—"}
          caption="one username = one press, always equal to total presses"
        />
        <StatTile
          label="CLOSEST CALL EVER"
          value={stats.totalPresses ? `${stats.closestCallSeconds}s` : "—"}
          caption={stats.closestCallUsername || "lowest clock at press"}
        />
        <StatTile
          label="MOST RECENT PRESS"
          value={latest ? `${latest.remaining}s — ${latestFaction!.name}` : "—"}
          caption={latest ? latest.presser : "no presses yet"}
        />
        <StatTile label="EXPERIMENT UPTIME" value={stats.uptimeSeconds != null ? formatDuration(stats.uptimeSeconds) : "—"} caption="since activation" />
        <StatTile label="CURRENT COUNTDOWN" value={reading.label} caption="interpolated locally, resynced from the server" />
        <StatTile label="PRESSES · LAST HOUR" value={eventsLoaded ? counts.lastHour.toLocaleString() : "—"} caption="from the database" />
        <StatTile label="PRESSES · LAST 24H" value={eventsLoaded ? counts.last24h.toLocaleString() : "—"} caption="from the database" />
      </div>

      <div className={styles.sectionGap}>
        <span className={styles.eyebrow}>FACTION DISTRIBUTION</span>
        <div className={styles.spacer} />
        <FactionBars counts={factionCountsArray} total={stats.totalPresses} />
      </div>

      <div className={styles.sectionGap}>
        <HourlyChart buckets={buckets} />
      </div>

      <div className={styles.sectionGap}>
        <span className={styles.eyebrow}>FACTION LEADERBOARD</span>
        <p className={styles.sectionNote}>Ranked by participant count only. No token ownership, no weighting.</p>
        <div className={styles.spacer} />
        <FactionLeaderboard counts={factionCountsArray} />
      </div>

      <div className={styles.sectionGap}>
        <span className={styles.eyebrow}>CLOSEST-CALL HALL OF FAME</span>
        <div className={styles.spacer} />
        <HallOfFame events={closest} />
      </div>

      <div className={styles.sectionGap}>
        <span className={styles.eyebrow}>LEGENDARY — CLOSEST POSSIBLE CALLS</span>
        <p className={styles.sectionNote}>
          Remaining is a whole second, and 0 is unreachable — pressing exactly at the deadline reverts. {LEGENDARY_MAX_SECONDS}s or less is
          as close as anyone can ever get.
        </p>
        <div className={styles.spacer} />
        <LegendaryPresses events={legendary} />
      </div>

      <div className={styles.sectionGap}>
        <span className={styles.eyebrow}>MILESTONES</span>
        <div className={styles.spacer} />
        <Milestones milestones={milestoneList} />
      </div>
    </section>
  );
}

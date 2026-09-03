import { formatDuration, shortAddress } from "../../domain/format";
import { runtimeConfig } from "../../config/runtimeConfig";
import { useStreak } from "../../hooks/useStreak";
import type { ExperimentState, PressEvent } from "../../domain/types";
import type { PreviewClockState } from "../../hooks/usePreviewClock";
import StatTile from "./StatTile";
import FactionBars from "./FactionBars";

export default function StatsPanel({
  state,
  events,
  preview
}: {
  state: ExperimentState;
  events: PressEvent[];
  preview: PreviewClockState | null;
}) {
  const total = runtimeConfig.previewMode ? preview!.total : state.totalPresses;
  const closest = runtimeConfig.previewMode ? preview!.closest : state.closestCall;
  const counts = runtimeConfig.previewMode ? preview!.factionCounts : state.factionCounts;
  const streak = useStreak(events);
  const latestPresser = events[0]?.presser;

  const ageSeconds = runtimeConfig.previewMode
    ? (Math.min(Date.now(), preview!.deadlineMs) - preview!.startedAtMs) / 1000
    : state.started
      ? Math.max(0, (state.alive ? Date.now() + state.chainOffsetMs : state.deadline * 1000) / 1000 - state.startedAt)
      : NaN;

  return (
    <section id="stats" aria-label="Experiment stats">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderLeft: "1px solid var(--line)", borderRight: "1px solid var(--line)" }}>
        <StatTile label="TOTAL PRESSES" value={total ? total.toLocaleString() : "—"} caption="one wallet = one press" />
        <StatTile label="EXPERIMENT UPTIME" value={Number.isFinite(ageSeconds) ? formatDuration(ageSeconds) : "—"} caption="since activation" />
        <StatTile label="CLOSEST CALL" value={total ? `${closest}s` : "—"} caption="lowest clock at press" />
        <StatTile label="CURRENT STREAK" value={streak ? String(streak) : "—"} caption="consecutive same-faction presses" />
      </div>
      <div style={{ marginTop: 1 }}>
        <StatTile label="LATEST PRESSER" value={latestPresser ? shortAddress(latestPresser) : "—"} caption="most recent wallet" />
      </div>
      <FactionBars counts={counts} total={total} />
    </section>
  );
}

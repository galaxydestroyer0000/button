import { useState } from "react";
import styles from "./HourlyChart.module.css";

const WIDTH = 720;
const HEIGHT = 160;
const PADDING_BOTTOM = 22;
const PADDING_TOP = 10;
const BAR_GAP = 3;

/**
 * Presses per hour, last 24 hours — a single-series magnitude-over-time bar chart.
 * Every bar is a real bucketed count from the local event store; an all-zero window
 * renders an explicit empty state rather than a flat, misleadingly-precise chart.
 */
export default function HourlyChart({ buckets }: { buckets: number[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1, ...buckets);
  const hasAnyPresses = buckets.some((count) => count > 0);
  const barWidth = (WIDTH - BAR_GAP * (buckets.length - 1)) / buckets.length;
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.eyebrow}>PRESSES PER HOUR</span>
        <span className={styles.subtitle}>Last 24 hours, oldest to most recent</span>
      </div>
      {!hasAnyPresses ? (
        <div className={styles.empty}>NO PRESSES RECORDED IN THE LAST 24 HOURS.</div>
      ) : (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.svg} role="img" aria-label="Presses per hour, last 24 hours">
          <line x1={0} y1={HEIGHT - PADDING_BOTTOM} x2={WIDTH} y2={HEIGHT - PADDING_BOTTOM} className={styles.baseline} />
          {buckets.map((count, i) => {
            const barHeight = (count / max) * plotHeight;
            const x = i * (barWidth + BAR_GAP);
            const y = HEIGHT - PADDING_BOTTOM - barHeight;
            return (
              <g
                key={i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                className={styles.barGroup}
              >
                {/* Invisible full-height hit target — the visible bar can be much
                    shorter than the plot area, so hover needs its own generous target. */}
                <rect x={x} y={PADDING_TOP} width={barWidth} height={plotHeight} fill="transparent" />
                <rect
                  x={x}
                  y={count > 0 ? y : HEIGHT - PADDING_BOTTOM - 1.5}
                  width={barWidth}
                  height={count > 0 ? barHeight : 1.5}
                  rx={Math.min(4, barWidth / 2)}
                  className={hovered === i ? styles.barHover : styles.bar}
                />
              </g>
            );
          })}
          {[18, 12, 6, 0].map((hoursAgo) => {
            const i = buckets.length - 1 - hoursAgo;
            const x = i * (barWidth + BAR_GAP) + barWidth / 2;
            return (
              <text key={hoursAgo} x={x} y={HEIGHT - 6} textAnchor="middle" className={styles.axisLabel}>
                {hoursAgo === 0 ? "NOW" : `-${hoursAgo}H`}
              </text>
            );
          })}
        </svg>
      )}
      {hovered !== null && hasAnyPresses && (
        <div className={styles.tooltip}>
          {buckets.length - 1 - hovered === 0 ? "THIS HOUR" : `${buckets.length - 1 - hovered}H AGO`} · {buckets[hovered]} PRESS
          {buckets[hovered] === 1 ? "" : "ES"}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef } from "react";
import styles from "./CountdownDisplay.module.css";
import type { CountdownReading } from "../../hooks/useCountdown";

export default function CountdownDisplay({
  reading,
  deadlineLabel,
  pulseKey
}: {
  reading: CountdownReading;
  deadlineLabel: string;
  pulseKey: string;
}) {
  const timerRef = useRef<HTMLDivElement>(null);
  const prevPulseKey = useRef(pulseKey);

  useEffect(() => {
    if (pulseKey && prevPulseKey.current && pulseKey !== prevPulseKey.current) {
      timerRef.current?.animate([{ transform: "scale(1.035)" }, { transform: "scale(1)" }], { duration: 380, easing: "ease-out" });
    }
    prevPulseKey.current = pulseKey;
  }, [pulseKey]);

  const classes = [styles.timer, reading.urgent && styles.urgent, reading.critical && styles.critical].filter(Boolean).join(" ");

  return (
    <div className={styles.wrap} aria-live="polite">
      <div className={styles.systemLabel}>SHARED TIMER · LIVE SERVER STATE</div>
      <div ref={timerRef} className={classes} role="timer" aria-label="Shared countdown">
        {reading.label}
      </div>
      <div className={styles.deadlineLabel}>{deadlineLabel}</div>
    </div>
  );
}

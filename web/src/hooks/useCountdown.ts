import { useEffect, useRef, useState } from "react";
import { playTone } from "../audio/tick";

export interface CountdownReading {
  label: string;
  urgent: boolean;
  critical: boolean;
  remainingMs: number;
}

const SEALED_READING: CountdownReading = { label: "00:--", urgent: false, critical: false, remainingMs: 0 };

export function useCountdown(deadlineMs: number | null, options: { sealed: boolean; alive: boolean }): CountdownReading {
  const [reading, setReading] = useState<CountdownReading>(SEALED_READING);
  const lastTickSecondRef = useRef<number | null>(null);
  const { sealed, alive } = options;

  useEffect(() => {
    if (sealed || deadlineMs === null) {
      setReading(SEALED_READING);
      document.body.classList.remove("warning");
      return;
    }

    let frame: number;
    function tick() {
      const remainingMs = Math.max(0, deadlineMs! - Date.now());
      const secondsWhole = Math.floor(remainingMs / 1000);
      const hundredths = Math.floor((remainingMs % 1000) / 10);
      const label = `00:${String(secondsWhole).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
      const remainingSec = remainingMs / 1000;
      const urgent = alive && remainingSec <= 12;
      const critical = alive && remainingSec <= 5;

      if (urgent && secondsWhole !== lastTickSecondRef.current) {
        lastTickSecondRef.current = secondsWhole;
        playTone(remainingSec <= 5 ? 780 : 520, 0.028, remainingSec <= 5 ? 0.035 : 0.018);
      }
      if (!urgent) lastTickSecondRef.current = null;

      document.body.classList.toggle("warning", urgent);
      setReading({ label, urgent, critical, remainingMs });
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [deadlineMs, sealed, alive]);

  return reading;
}

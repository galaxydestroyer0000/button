import { useCallback, useState } from "react";
import { factionForRemaining } from "../domain/factions";
import type { PressEvent } from "../domain/types";

export interface PreviewClockState {
  startedAtMs: number;
  deadlineMs: number;
  pressed: boolean;
  faction: number;
  remaining: number;
  total: number;
  closest: number;
  factionCounts: [number, number, number, number, number, number, number];
  ended: boolean;
  events: PressEvent[];
  press: () => void;
}

export function usePreviewClock(): PreviewClockState {
  const [startedAtMs] = useState(() => Date.now());
  const [deadlineMs, setDeadlineMs] = useState(() => Date.now() + 60_000);
  const [pressed, setPressed] = useState(false);
  const [faction, setFaction] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const [closest, setClosest] = useState(0);
  const [factionCounts, setFactionCounts] = useState<[number, number, number, number, number, number, number]>([0, 0, 0, 0, 0, 0, 0]);
  const [ended] = useState(false);
  const [events, setEvents] = useState<PressEvent[]>([]);

  const press = useCallback(() => {
    setPressed((alreadyPressed) => {
      if (alreadyPressed || ended) return alreadyPressed;
      const left = Math.max(1, Math.min(60, Math.ceil((deadlineMs - Date.now()) / 1000)));
      const nextFaction = factionForRemaining(left);
      setFaction(nextFaction);
      setRemaining(left);
      setTotal((t) => t + 1);
      setClosest(left);
      setFactionCounts((counts) => {
        const next = [...counts] as typeof counts;
        next[nextFaction] += 1;
        return next;
      });
      setDeadlineMs(Date.now() + 60_000);
      setEvents((prev) => [
        {
          key: `preview-${Date.now()}`,
          txHash: "",
          presser: "0x0000000000000000000000000000000000PVEW" as `0x${string}`,
          remaining: left,
          faction: nextFaction,
          timestamp: Math.floor(Date.now() / 1000),
          pressNumber: total + 1,
          blockNumber: 0,
          logIndex: 0
        },
        ...prev
      ]);
      return true;
    });
  }, [deadlineMs, ended, total]);

  return { startedAtMs, deadlineMs, pressed, faction, remaining, total, closest, factionCounts, ended, events, press };
}

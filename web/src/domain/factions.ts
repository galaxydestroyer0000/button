import type { Faction } from "./types";

export const FACTIONS: Record<number, Faction> = {
  0: { id: 0, name: "GREY", range: "NEVER PRESSED", color: "#858585", seed: "hasn't pressed" },
  1: { id: 1, name: "PURPLE", range: "52–60s", color: "#8b5cf6", seed: "pressed immediately" },
  2: { id: 2, name: "BLUE", range: "42–51s", color: "#3b82f6", seed: "didn't wait long" },
  3: { id: 3, name: "GREEN", range: "32–41s", color: "#22c55e", seed: "let it breathe" },
  4: { id: 4, name: "YELLOW", range: "22–31s", color: "#f4d03f", seed: "watched it fall" },
  5: { id: 5, name: "ORANGE", range: "12–21s", color: "#f97316", seed: "felt the pressure" },
  6: { id: 6, name: "RED", range: "0–11s", color: "#ef4444", seed: "risked the experiment closest to death" }
};

export function factionForRemaining(remaining: number): number {
  if (remaining >= 52) return 1;
  if (remaining >= 42) return 2;
  if (remaining >= 32) return 3;
  if (remaining >= 22) return 4;
  if (remaining >= 12) return 5;
  return 6;
}

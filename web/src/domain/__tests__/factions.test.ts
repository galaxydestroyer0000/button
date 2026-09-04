import { describe, expect, it } from "vitest";
import { factionForRemaining, FACTIONS } from "../factions";

// Mirrors ButtonExperiment.sol's _factionFor exactly. If these two ever diverge, the
// UI would color/label a press differently than the contract's own onchain record —
// cosmetically wrong, never a source-of-truth bug (the contract's pressFaction is
// always what's rendered once a press is confirmed), but still worth pinning down
// with an exhaustive boundary check rather than a couple of spot values.
function contractFactionFor(remaining: number): number {
  if (remaining >= 52) return 1; // PURPLE
  if (remaining >= 42) return 2; // BLUE
  if (remaining >= 32) return 3; // GREEN
  if (remaining >= 22) return 4; // YELLOW
  if (remaining >= 12) return 5; // ORANGE
  return 6; // RED
}

describe("factionForRemaining — parity with the contract's _factionFor", () => {
  it("matches the contract's band assignment for every reachable remaining value (1-60)", () => {
    for (let remaining = 1; remaining <= 60; remaining++) {
      expect(factionForRemaining(remaining)).toBe(contractFactionFor(remaining));
    }
  });

  it("matches at 0, even though 0 is unreachable via a real press (contract reverts before assigning a faction)", () => {
    expect(factionForRemaining(0)).toBe(contractFactionFor(0));
  });

  it.each([
    [60, 1],
    [52, 1],
    [51, 2],
    [42, 2],
    [41, 3],
    [32, 3],
    [31, 4],
    [22, 4],
    [21, 5],
    [12, 5],
    [11, 6],
    [1, 6]
  ])("remaining=%i -> faction id %i", (remaining, expected) => {
    expect(factionForRemaining(remaining)).toBe(expected);
  });

  it("every non-zero faction id returned has a corresponding FACTIONS entry", () => {
    for (let remaining = 1; remaining <= 60; remaining++) {
      const id = factionForRemaining(remaining);
      expect(FACTIONS[id]).toBeDefined();
    }
  });
});

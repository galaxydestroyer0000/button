import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  getClosestCalls,
  getPressByNumber,
  getTopEvents,
  openEventDb,
  putEvents,
  queryPage,
  wasNewClosestCallAtTheTime
} from "../eventDb";
import type { PressEvent } from "../../domain/types";

const ALICE = "0x00000000000000000000000000000000000A11cE" as const;
const BOB = "0x000000000000000000000000000000000000b0b0" as const;
const CAROL = "0x0000000000000000000000000000000000CA501C" as const;

function event(overrides: Partial<PressEvent>): PressEvent {
  return {
    key: `${overrides.txHash ?? "0xtx"}:${overrides.logIndex ?? 0}`,
    txHash: "0xtx",
    presser: ALICE,
    remaining: 30,
    faction: 3,
    timestamp: 1000,
    pressNumber: 1,
    blockNumber: 10,
    logIndex: 0,
    ...overrides
  };
}

beforeEach(() => {
  indexedDB = new IDBFactory();
});

describe("eventDb — reorg: same wallet's tx reassigned a different pressNumber", () => {
  it("does not throw when two records momentarily share a pressNumber (index is non-unique by design)", async () => {
    const db = await openEventDb("test-reorg-collision");
    // Two distinct transactions both temporarily claim pressNumber 5 — the exact
    // shape of a reorg that reorders two presses relative to each other before the
    // second (correcting) sync pass has run for both.
    const a = event({ txHash: "0xaaa", logIndex: 0, presser: ALICE, pressNumber: 5, blockNumber: 100 });
    const b = event({ txHash: "0xbbb", logIndex: 0, presser: BOB, pressNumber: 5, blockNumber: 101 });

    await expect(putEvents(db, [a, b])).resolves.not.toThrow();

    const stored = await getTopEvents(db, 10);
    expect(stored).toHaveLength(2);
  });

  it("a later sync pass correcting one side's pressNumber overwrites by key, not by pressNumber", async () => {
    const db = await openEventDb("test-reorg-correction");
    const original = event({ txHash: "0xaaa", logIndex: 0, presser: ALICE, pressNumber: 5, blockNumber: 100 });
    await putEvents(db, [original]);

    // The reorg reassigns this same transaction (same key) to pressNumber 6.
    const corrected = event({ txHash: "0xaaa", logIndex: 0, presser: ALICE, pressNumber: 6, blockNumber: 100 });
    await putEvents(db, [corrected]);

    const byNumber6 = await getPressByNumber(db, 6);
    expect(byNumber6?.txHash).toBe("0xaaa");
    // The stale pressNumber-5 record for this same key is gone — upserted, not duplicated.
    const stored = await getTopEvents(db, 10);
    expect(stored).toHaveLength(1);
    expect(stored[0].pressNumber).toBe(6);
  });
});

describe("eventDb — queryPage filters and pagination", () => {
  it("filters by faction, presser, and pressNumber independently and in combination", async () => {
    const db = await openEventDb("test-query-filters");
    await putEvents(db, [
      event({ txHash: "0x1", presser: ALICE, faction: 1, pressNumber: 1 }),
      event({ txHash: "0x2", presser: BOB, faction: 6, pressNumber: 2 }),
      event({ txHash: "0x3", presser: ALICE, faction: 6, pressNumber: 3 })
    ]);

    const byFaction = await queryPage(db, 1, 10, { faction: 6 });
    expect(byFaction.total).toBe(2);

    const byPresser = await queryPage(db, 1, 10, { presser: ALICE });
    expect(byPresser.total).toBe(2);

    const byBoth = await queryPage(db, 1, 10, { faction: 6, presser: ALICE });
    expect(byBoth.total).toBe(1);
    expect(byBoth.items[0].pressNumber).toBe(3);

    const byPresserCaseInsensitive = await queryPage(db, 1, 10, { presser: ALICE.toUpperCase() as `0x${string}` });
    expect(byPresserCaseInsensitive.total).toBe(2);
  });

  it("paginates newest-press-first without dropping or duplicating rows across pages", async () => {
    const db = await openEventDb("test-query-pagination");
    const events = Array.from({ length: 25 }, (_, i) => event({ txHash: `0x${i}`, pressNumber: i + 1 }));
    await putEvents(db, events);

    const page1 = await queryPage(db, 1, 10);
    const page2 = await queryPage(db, 2, 10);
    const page3 = await queryPage(db, 3, 10);

    expect(page1.total).toBe(25);
    expect(page1.items.map((e) => e.pressNumber)).toEqual([25, 24, 23, 22, 21, 20, 19, 18, 17, 16]);
    expect(page2.items.map((e) => e.pressNumber)).toEqual([15, 14, 13, 12, 11, 10, 9, 8, 7, 6]);
    expect(page3.items.map((e) => e.pressNumber)).toEqual([5, 4, 3, 2, 1]);
  });

  it("returns an empty page (not an error) past the end of the data", async () => {
    const db = await openEventDb("test-query-empty");
    await putEvents(db, [event({ txHash: "0x1", pressNumber: 1 })]);
    const page = await queryPage(db, 5, 10);
    expect(page.items).toEqual([]);
    expect(page.total).toBe(1);
  });
});

describe("eventDb — closest calls and hall-of-fame ordering", () => {
  it("orders by remaining ascending, breaking ties by press number", async () => {
    const db = await openEventDb("test-closest-calls");
    await putEvents(db, [
      event({ txHash: "0x1", pressNumber: 1, remaining: 10 }),
      event({ txHash: "0x2", pressNumber: 2, remaining: 3 }),
      event({ txHash: "0x3", pressNumber: 3, remaining: 3 }),
      event({ txHash: "0x4", pressNumber: 4, remaining: 40 })
    ]);
    const closest = await getClosestCalls(db, 10);
    expect(closest.map((e) => e.pressNumber)).toEqual([2, 3, 1, 4]);
  });
});

describe("eventDb — wasNewClosestCallAtTheTime", () => {
  it("is true only for a press strictly better than every earlier press", async () => {
    const db = await openEventDb("test-was-new-record");
    await putEvents(db, [
      event({ txHash: "0x1", pressNumber: 1, remaining: 20 }),
      event({ txHash: "0x2", pressNumber: 2, remaining: 15 }),
      event({ txHash: "0x3", pressNumber: 3, remaining: 25 }), // worse than the record — not new
      event({ txHash: "0x4", pressNumber: 4, remaining: 5 }) // better than everything before it — new
    ]);

    expect(await wasNewClosestCallAtTheTime(db, event({ txHash: "0x1", pressNumber: 1, remaining: 20 }))).toBe(true); // first ever
    expect(await wasNewClosestCallAtTheTime(db, event({ txHash: "0x2", pressNumber: 2, remaining: 15 }))).toBe(true);
    expect(await wasNewClosestCallAtTheTime(db, event({ txHash: "0x3", pressNumber: 3, remaining: 25 }))).toBe(false);
    expect(await wasNewClosestCallAtTheTime(db, event({ txHash: "0x4", pressNumber: 4, remaining: 5 }))).toBe(true);
  });
});

describe("eventDb — getPressByNumber", () => {
  it("returns null for a press number that hasn't been indexed, not an error", async () => {
    const db = await openEventDb("test-press-not-found");
    await putEvents(db, [event({ txHash: "0x1", pressNumber: 1 })]);
    expect(await getPressByNumber(db, 999)).toBeNull();
  });

  it("distinguishes wallets sharing similar-looking data via the presser field", async () => {
    const db = await openEventDb("test-press-distinct-wallets");
    await putEvents(db, [
      event({ txHash: "0x1", pressNumber: 1, presser: ALICE }),
      event({ txHash: "0x2", pressNumber: 2, presser: CAROL })
    ]);
    expect((await getPressByNumber(db, 1))?.presser).toBe(ALICE);
    expect((await getPressByNumber(db, 2))?.presser).toBe(CAROL);
  });
});

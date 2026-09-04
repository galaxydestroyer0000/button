import { describe, expect, it } from "vitest";
import { decodePressedLog, mergeEvents, planSyncChunks, tryDecodePressedLog } from "../reconcile";
import { fakePressedLog } from "./fixtures";
import type { PressEvent } from "../../domain/types";

describe("planSyncChunks", () => {
  it("returns a single chunk when the range fits within chunkSize", () => {
    expect(planSyncChunks(100n, 150n, 5_000n)).toEqual([{ from: 100n, to: 150n }]);
  });

  it("splits a wide range into bounded chunks with no gaps or overlaps", () => {
    const chunks = planSyncChunks(0n, 12_000n, 5_000n);
    expect(chunks).toEqual([
      { from: 0n, to: 4_999n },
      { from: 5_000n, to: 9_999n },
      { from: 10_000n, to: 12_000n }
    ]);
  });

  it("returns an empty list when fromBlock is already past toBlock", () => {
    expect(planSyncChunks(200n, 100n, 5_000n)).toEqual([]);
  });

  it("returns a single exact-boundary chunk when the range is exactly chunkSize", () => {
    expect(planSyncChunks(0n, 4_999n, 5_000n)).toEqual([{ from: 0n, to: 4_999n }]);
  });

  it("rejects a non-positive chunk size", () => {
    expect(() => planSyncChunks(0n, 100n, 0n)).toThrow();
  });
});

describe("decodePressedLog / tryDecodePressedLog", () => {
  it("decodes a real Pressed log into the canonical PressEvent shape", () => {
    const log = fakePressedLog({
      presser: "0x00000000000000000000000000000000000A11cE",
      remaining: 30,
      faction: 3,
      timestamp: 1_000,
      pressNumber: 5,
      blockNumber: 42n,
      logIndex: 1
    });
    const event = decodePressedLog(log);
    expect(event).toMatchObject({
      presser: "0x00000000000000000000000000000000000A11cE",
      remaining: 30,
      faction: 3,
      timestamp: 1_000,
      pressNumber: 5,
      blockNumber: 42,
      logIndex: 1
    });
    expect(event.key).toBe(`${log.transactionHash}:1`);
  });

  it("tryDecodePressedLog returns null instead of throwing for an undecodable log", () => {
    const garbage = { data: "0x1234", topics: ["0xnotarealtopic"], transactionHash: "0xabc", blockNumber: 1n, logIndex: 0 } as never;
    expect(tryDecodePressedLog(garbage)).toBeNull();
  });
});

describe("mergeEvents", () => {
  function event(pressNumber: number, key = `key-${pressNumber}`): PressEvent {
    return {
      key,
      txHash: key,
      presser: "0x00000000000000000000000000000000000A11cE",
      remaining: 10,
      faction: 6,
      timestamp: pressNumber,
      pressNumber,
      blockNumber: pressNumber,
      logIndex: 0
    };
  }

  it("sorts merged events newest-pressNumber-first", () => {
    const merged = mergeEvents([event(1), event(3)], [event(2)]);
    expect(merged.map((e) => e.pressNumber)).toEqual([3, 2, 1]);
  });

  it("deduplicates by key across batches, keeping the record present in the merge", () => {
    const merged = mergeEvents([event(1, "same-key")], [event(1, "same-key")]);
    expect(merged).toHaveLength(1);
  });

  it("returns an empty array when given no batches", () => {
    expect(mergeEvents()).toEqual([]);
  });
});

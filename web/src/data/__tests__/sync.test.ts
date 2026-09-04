import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { openEventDb, getSyncCursor, getTopEvents } from "../eventDb";
import { syncEvents, type SyncClient } from "../sync";
import { fakePressedLog } from "./fixtures";
import type { Log } from "viem";

const CONTRACT = "0x000000000000000000000000000000000B0770" as const;
const ALICE = "0x00000000000000000000000000000000000A11cE" as const;
const BOB = "0x000000000000000000000000000000000000b0b0" as const;

function makeClient(logsByRange: (fromBlock: bigint, toBlock: bigint) => Log[], latestBlock: bigint): SyncClient {
  return {
    getBlockNumber: async () => latestBlock,
    getLogs: async ({ fromBlock, toBlock }) => logsByRange(fromBlock, toBlock)
  };
}

// fake-indexeddb keeps a single global registry; reset it between tests so each test
// gets a clean database regardless of the (deployment-scoped) name it opens.
beforeEach(() => {
  indexedDB = new IDBFactory();
});

describe("syncEvents — fresh backfill", () => {
  it("walks the full deployBlock-to-latest range in chunks and persists every event", async () => {
    const db = await openEventDb("test-fresh-backfill");
    const allLogs = [
      fakePressedLog({ presser: ALICE, remaining: 55, faction: 1, timestamp: 100, pressNumber: 1, blockNumber: 10n, logIndex: 0 }),
      fakePressedLog({ presser: BOB, remaining: 8, faction: 6, timestamp: 200, pressNumber: 2, blockNumber: 6_010n, logIndex: 0 })
    ];
    const client = makeClient(
      (fromBlock, toBlock) => allLogs.filter((log) => (log.blockNumber as bigint) >= fromBlock && (log.blockNumber as bigint) <= toBlock),
      7_000n
    );

    const result = await syncEvents({ db, client, contractAddress: CONTRACT, deployBlock: 0n, chunkSize: 5_000n });

    expect(result.newEvents).toHaveLength(2);
    expect(result.cursor).toBe(7_000);
    expect(await getSyncCursor(db)).toBe(7_000);

    const stored = await getTopEvents(db, 10);
    expect(stored.map((e) => e.pressNumber)).toEqual([2, 1]);
  });

  it("issues no getLogs calls and makes no changes when fromBlock is already past latest", async () => {
    const db = await openEventDb("test-noop");
    let calls = 0;
    const client: SyncClient = {
      getBlockNumber: async () => 100n,
      getLogs: async () => {
        calls += 1;
        return [];
      }
    };
    // Pre-seed a cursor beyond the fake chain's head.
    await syncEvents({ db, client: makeClient(() => [], 100n), contractAddress: CONTRACT, deployBlock: 0n });
    const result = await syncEvents({ db, client, contractAddress: CONTRACT, deployBlock: 0n });

    expect(result.newEvents).toEqual([]);
    expect(calls).toBe(0);
  });
});

describe("syncEvents — reconnect after missed blocks", () => {
  it("resumes from the persisted cursor and only returns genuinely new events, not re-processing history", async () => {
    const db = await openEventDb("test-reconnect");
    const firstLog = fakePressedLog({ presser: ALICE, remaining: 40, faction: 2, timestamp: 100, pressNumber: 1, blockNumber: 10n, logIndex: 0 });

    // First sync: chain head is at block 10, one press has happened.
    const first = await syncEvents({
      db,
      client: makeClient((from, to) => (10n >= from && 10n <= to ? [firstLog] : []), 10n),
      contractAddress: CONTRACT,
      deployBlock: 0n
    });
    expect(first.newEvents).toHaveLength(1);
    expect(await getSyncCursor(db)).toBe(10);

    // Simulate the tab going to sleep / RPC dropping for a while: the chain has moved
    // on by several thousand blocks and a second wallet pressed somewhere in the gap.
    const secondLog = fakePressedLog({ presser: BOB, remaining: 5, faction: 6, timestamp: 9_000, pressNumber: 2, blockNumber: 8_500n, logIndex: 0 });
    const reconnect = await syncEvents({
      db,
      client: makeClient((from, to) => (8_500n >= from && 8_500n <= to ? [secondLog] : []), 12_000n),
      contractAddress: CONTRACT,
      deployBlock: 0n,
      chunkSize: 5_000n
    });

    // Only the new press should come back — the already-synced block 10 is never re-fetched.
    expect(reconnect.newEvents).toHaveLength(1);
    expect(reconnect.newEvents[0].pressNumber).toBe(2);
    expect(reconnect.cursor).toBe(12_000);

    const stored = await getTopEvents(db, 10);
    expect(stored.map((e) => e.pressNumber)).toEqual([2, 1]);
  });

  it("is safe to call repeatedly with no new blocks (idempotent polling)", async () => {
    const db = await openEventDb("test-idempotent-poll");
    const client = makeClient(() => [], 500n);

    const first = await syncEvents({ db, client, contractAddress: CONTRACT, deployBlock: 0n });
    const second = await syncEvents({ db, client, contractAddress: CONTRACT, deployBlock: 0n });

    expect(first.cursor).toBe(500);
    expect(second.newEvents).toEqual([]);
    expect(second.cursor).toBe(500);
  });
});

describe("syncEvents — crash mid-backfill", () => {
  it("persists the cursor after each completed chunk, so a later call resumes instead of restarting", async () => {
    const db = await openEventDb("test-crash-resume");
    const log = fakePressedLog({ presser: ALICE, remaining: 20, faction: 5, timestamp: 100, pressNumber: 1, blockNumber: 1_000n, logIndex: 0 });

    // A client whose second chunk throws, simulating an RPC drop partway through a
    // multi-chunk backfill (deployBlock 0 to latest 12000, chunkSize 5000 => 3 chunks).
    let call = 0;
    const flakyClient: SyncClient = {
      getBlockNumber: async () => 12_000n,
      getLogs: async ({ fromBlock, toBlock }) => {
        call += 1;
        if (call === 2) throw new Error("RPC unavailable");
        return fromBlock <= 1_000n && 1_000n <= toBlock ? [log] : [];
      }
    };

    await expect(syncEvents({ db, client: flakyClient, contractAddress: CONTRACT, deployBlock: 0n, chunkSize: 5_000n })).rejects.toThrow(
      "RPC unavailable"
    );

    // The first chunk (0-4999, containing the press) must have been persisted before
    // the second chunk's failure — this is the crash-resume guarantee.
    expect(await getSyncCursor(db)).toBe(4_999);
    const storedAfterCrash = await getTopEvents(db, 10);
    expect(storedAfterCrash).toHaveLength(1);

    // A later, healthy call resumes from 5000 rather than re-scanning from deployBlock.
    const seenRanges: Array<[bigint, bigint]> = [];
    const healedClient: SyncClient = {
      getBlockNumber: async () => 12_000n,
      getLogs: async ({ fromBlock, toBlock }) => {
        seenRanges.push([fromBlock, toBlock]);
        return [];
      }
    };
    const resumed = await syncEvents({ db, client: healedClient, contractAddress: CONTRACT, deployBlock: 0n, chunkSize: 5_000n });

    expect(seenRanges[0][0]).toBe(5_000n); // resumes right after the persisted cursor
    expect(resumed.cursor).toBe(12_000);
  });
});

describe("syncEvents — reorg safety margin (confirmations)", () => {
  it("never advances the cursor into the unconfirmed tail", async () => {
    const db = await openEventDb("test-reorg-margin-cursor");
    const client = makeClient(() => [], 1_000n);

    const result = await syncEvents({ db, client, contractAddress: CONTRACT, deployBlock: 0n, confirmations: 5n });

    expect(result.cursor).toBe(995); // latest(1000) - confirmations(5), never 1000
    expect(await getSyncCursor(db)).toBe(995);
  });

  it("re-fetches the last `confirmations` blocks on every subsequent pass, correcting a reorged event", async () => {
    const db = await openEventDb("test-reorg-margin-correction");

    // Pass 1: chain head is 100. A press lands at block 98 (within the eventual
    // margin) as presser ALICE.
    const originalLog = fakePressedLog({ presser: ALICE, remaining: 30, faction: 3, timestamp: 100, pressNumber: 1, blockNumber: 98n, logIndex: 0 });
    await syncEvents({
      db,
      client: makeClient((from, to) => (98n >= from && 98n <= to ? [originalLog] : []), 100n),
      contractAddress: CONTRACT,
      deployBlock: 0n,
      confirmations: 5n
    });
    expect(await getSyncCursor(db)).toBe(95); // 100 - 5

    // Pass 2: the chain reorged — block 98's transaction was replaced (same tx hash,
    // different remaining/faction because it landed against a different deadline
    // after reordering). Chain head has also advanced to 110.
    const reorgedLog = fakePressedLog({ presser: ALICE, remaining: 12, faction: 5, timestamp: 108, pressNumber: 1, blockNumber: 98n, logIndex: 0 });
    const result = await syncEvents({
      db,
      client: makeClient((from, to) => (98n >= from && 98n <= to ? [reorgedLog] : []), 110n),
      contractAddress: CONTRACT,
      deployBlock: 0n,
      confirmations: 5n
    });

    expect(result.cursor).toBe(105); // 110 - 5
    const stored = await getTopEvents(db, 10);
    expect(stored).toHaveLength(1);
    expect(stored[0].remaining).toBe(12); // corrected, not the stale value from pass 1
    expect(stored[0].faction).toBe(5);
  });

  it("with confirmations=0 (the default), behaves exactly as before — cursor advances straight to head", async () => {
    const db = await openEventDb("test-reorg-margin-default");
    const client = makeClient(() => [], 500n);
    const result = await syncEvents({ db, client, contractAddress: CONTRACT, deployBlock: 0n });
    expect(result.cursor).toBe(500);
  });
});

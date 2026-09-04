import type { PressEvent } from "../domain/types";

const DB_VERSION = 1;
const STORE_PRESSES = "presses";
const STORE_META = "meta";
const SYNC_CURSOR_ID = "syncCursor";

export interface EventFilters {
  faction?: number;
  presser?: `0x${string}`;
  pressNumber?: number;
}

export interface EventPage {
  items: PressEvent[];
  total: number;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/**
 * Opens (creating on first use) the per-deployment event store. The database name is
 * scoped to the configured contract address, so switching contracts (e.g. testnet to
 * mainnet promotion, per README's deploy flow) never mixes histories in one browser.
 */
export function openEventDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PRESSES)) {
        const store = db.createObjectStore(STORE_PRESSES, { keyPath: "key" });
        // Not unique: pressNumber is contract-assigned execution order, which a chain
        // reorg can reassign across two transactions (same wallets, different final
        // order). A unique index would throw ConstraintError on the intermediate
        // upsert state and abort the whole reconciliation pass. The store's real
        // primary key is `key` (tx hash + log index), which stays a true 1:1 identity
        // across reorgs of the same transaction.
        store.createIndex("pressNumber", "pressNumber", { unique: false });
        store.createIndex("faction", "faction", { unique: false });
        store.createIndex("presser", "presser", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Bulk upsert — safe to call repeatedly with overlapping data; each event's own
 *  tx-hash+log-index key makes every put idempotent. */
export async function putEvents(db: IDBDatabase, events: PressEvent[]): Promise<void> {
  if (events.length === 0) return;
  const tx = db.transaction(STORE_PRESSES, "readwrite");
  const store = tx.objectStore(STORE_PRESSES);
  for (const event of events) store.put(event);
  await txDone(tx);
}

export async function getSyncCursor(db: IDBDatabase): Promise<number | null> {
  const tx = db.transaction(STORE_META, "readonly");
  const record = await promisify(tx.objectStore(STORE_META).get(SYNC_CURSOR_ID) as IDBRequest<{ id: string; block: number } | undefined>);
  return record?.block ?? null;
}

export async function setSyncCursor(db: IDBDatabase, block: number): Promise<void> {
  const tx = db.transaction(STORE_META, "readwrite");
  tx.objectStore(STORE_META).put({ id: SYNC_CURSOR_ID, block });
  await txDone(tx);
}

/** The N most recent presses, newest first — used by the homepage's live tape,
 *  which only ever needs a small fixed window, not a paginated query. */
export async function getTopEvents(db: IDBDatabase, limit: number): Promise<PressEvent[]> {
  const tx = db.transaction(STORE_PRESSES, "readonly");
  const index = tx.objectStore(STORE_PRESSES).index("pressNumber");
  const items: PressEvent[] = [];
  await new Promise<void>((resolve, reject) => {
    const request = index.openCursor(null, "prev");
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || items.length >= limit) {
        resolve();
        return;
      }
      items.push(cursor.value as PressEvent);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
  return items;
}

/**
 * Paginates the local store, newest-press-first, with optional exact-match filters.
 * Walks the pressNumber index once and filters in memory rather than maintaining a
 * compound index per filter combination — deliberately simple, and correct at this
 * domain's realistic scale (one press per wallet, gas-paid, bounded by a real end —
 * never remotely approaching a size where an in-memory scan matters).
 */
export async function queryPage(db: IDBDatabase, page: number, pageSize: number, filters: EventFilters = {}): Promise<EventPage> {
  const tx = db.transaction(STORE_PRESSES, "readonly");
  const index = tx.objectStore(STORE_PRESSES).index("pressNumber");
  const matches: PressEvent[] = [];

  await new Promise<void>((resolve, reject) => {
    const request = index.openCursor(null, "prev");
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const event = cursor.value as PressEvent;
      const matchesFaction = filters.faction === undefined || event.faction === filters.faction;
      const matchesPresser = !filters.presser || event.presser.toLowerCase() === filters.presser.toLowerCase();
      const matchesPressNumber = filters.pressNumber === undefined || event.pressNumber === filters.pressNumber;
      if (matchesFaction && matchesPresser && matchesPressNumber) matches.push(event);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });

  const start = (page - 1) * pageSize;
  return { items: matches.slice(start, start + pageSize), total: matches.length };
}

/** Count of presses with timestamp >= sinceUnixSeconds, for last-hour/24h stats. */
export async function countSince(db: IDBDatabase, sinceUnixSeconds: number): Promise<number> {
  const tx = db.transaction(STORE_PRESSES, "readonly");
  const index = tx.objectStore(STORE_PRESSES).index("timestamp");
  const range = IDBKeyRange.lowerBound(sinceUnixSeconds);
  return promisify(index.count(range));
}

/**
 * Press counts bucketed into fixed-width time windows, oldest bucket first — the
 * data behind the /stats "presses over time" chart. Every count is a real tally of
 * indexed events; there is no interpolation or synthetic filling of empty buckets
 * (an empty bucket is genuinely 0, not an invented value).
 */
export async function bucketCounts(db: IDBDatabase, sinceUnixSeconds: number, bucketSeconds: number, bucketCount: number): Promise<number[]> {
  const buckets = new Array<number>(bucketCount).fill(0);
  const tx = db.transaction(STORE_PRESSES, "readonly");
  const index = tx.objectStore(STORE_PRESSES).index("timestamp");
  const range = IDBKeyRange.lowerBound(sinceUnixSeconds);

  await new Promise<void>((resolve, reject) => {
    const request = index.openCursor(range);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      const event = cursor.value as PressEvent;
      const bucketIndex = Math.floor((event.timestamp - sinceUnixSeconds) / bucketSeconds);
      if (bucketIndex >= 0 && bucketIndex < bucketCount) buckets[bucketIndex] += 1;
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });

  return buckets;
}

/** The N closest calls ever recorded, closest first — the /stats hall of fame. Walks
 *  the full store and sorts in memory rather than maintaining a `remaining` index,
 *  same "simple at this domain's realistic scale" tradeoff as queryPage. */
export async function getClosestCalls(db: IDBDatabase, limit: number): Promise<PressEvent[]> {
  const tx = db.transaction(STORE_PRESSES, "readonly");
  const all = await promisify(tx.objectStore(STORE_PRESSES).getAll());
  return (all as PressEvent[]).sort((a, b) => a.remaining - b.remaining || a.pressNumber - b.pressNumber).slice(0, limit);
}

/** Every press at or under `maxRemaining` seconds, closest first — the "closest
 *  possible calls" legendary tier (see domain/factions.ts and StatsPage for why this
 *  isn't framed as "under 1 second": remaining is a whole-second integer and 0 is
 *  unreachable, so 1s is the practical floor). */
export async function getLegendaryPresses(db: IDBDatabase, maxRemaining: number): Promise<PressEvent[]> {
  const all = await getClosestCalls(db, Number.MAX_SAFE_INTEGER);
  return all.filter((event) => event.remaining <= maxRemaining);
}

/** A single press by its exact press number, or null if it hasn't been indexed
 *  (locally) yet — the store's pressNumber index is unique, so this is a direct
 *  lookup, not a scan. */
export async function getPressByNumber(db: IDBDatabase, pressNumber: number): Promise<PressEvent | null> {
  const tx = db.transaction(STORE_PRESSES, "readonly");
  const index = tx.objectStore(STORE_PRESSES).index("pressNumber");
  const result = await promisify(index.get(pressNumber) as IDBRequest<PressEvent | undefined>);
  return result ?? null;
}

/** Whether `event` was the record-setting closest call at the moment it happened —
 *  i.e. no earlier press (by press number) had already reached that remaining value
 *  or lower. Used by /press/[number] to answer "did this become a new closest call".
 *  A real computation over locally-indexed history, not a guess. */
export async function wasNewClosestCallAtTheTime(db: IDBDatabase, event: PressEvent): Promise<boolean> {
  const tx = db.transaction(STORE_PRESSES, "readonly");
  const index = tx.objectStore(STORE_PRESSES).index("pressNumber");
  const range = IDBKeyRange.upperBound(event.pressNumber, true);
  let earlierMin = Infinity;
  await new Promise<void>((resolve, reject) => {
    const request = index.openCursor(range);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      earlierMin = Math.min(earlierMin, (cursor.value as PressEvent).remaining);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
  return event.remaining < earlierMin;
}

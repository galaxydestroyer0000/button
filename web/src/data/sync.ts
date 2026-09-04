import type { Log } from "viem";
import { getSyncCursor, putEvents, setSyncCursor } from "./eventDb";
import { planSyncChunks, tryDecodePressedLog } from "./reconcile";
import type { PressEvent } from "../domain/types";

export interface SyncClient {
  getBlockNumber(): Promise<bigint>;
  getLogs(params: { address: `0x${string}`; fromBlock: bigint; toBlock: bigint }): Promise<Log[]>;
}

export interface SyncResult {
  newEvents: PressEvent[];
  cursor: number;
  latestBlock: number;
}

const DEFAULT_CHUNK_SIZE = 5_000n;
const DEFAULT_CONFIRMATIONS = 0n;

/**
 * One reconciliation pass: reads the persisted cursor, walks forward to the chain's
 * current head in bounded chunks, and persists both the decoded events and the
 * advancing cursor after every chunk — not just once at the end — so a page close,
 * tab sleep, or crash mid-backfill resumes from the last completed chunk on the next
 * call instead of re-scanning from the deployment block. This one function is the
 * entire "polling/fallback reconciliation mechanism using block numbers": the same
 * call handles first-ever backfill, a routine poll tick, and catching up after being
 * offline for a while — they're all just "cursor is behind head by N blocks".
 *
 * Reorg safety: the cursor is never allowed to advance past `latestBlock -
 * confirmations` ("safeHead"), and every pass re-walks the last `confirmations`
 * blocks behind whatever was previously persisted, not just from cursor+1. Each
 * event upsert is idempotent (keyed by tx hash + log index), so re-fetching a block
 * whose contents didn't change is a no-op; re-fetching one that got reorged out and
 * replaced overwrites the stale record with the canonical one. This bounds — it does
 * not eliminate — reorg risk: a reorg deeper than `confirmations` blocks can still
 * leave a stale cached event (see SECURITY.md's RPC/indexer assumptions).
 */
export async function syncEvents(params: {
  db: IDBDatabase;
  client: SyncClient;
  contractAddress: `0x${string}`;
  deployBlock: bigint;
  chunkSize?: bigint;
  confirmations?: bigint;
}): Promise<SyncResult> {
  const { db, client, contractAddress, deployBlock, chunkSize = DEFAULT_CHUNK_SIZE, confirmations = DEFAULT_CONFIRMATIONS } = params;

  const latestBlock = await client.getBlockNumber();
  const safeHead = latestBlock > confirmations ? latestBlock - confirmations : 0n;
  const storedCursor = await getSyncCursor(db);
  const resumeFrom = storedCursor !== null ? BigInt(storedCursor) + 1n - confirmations : deployBlock;
  const fromBlock = resumeFrom > deployBlock ? resumeFrom : deployBlock;

  if (fromBlock > safeHead) {
    return { newEvents: [], cursor: storedCursor ?? Number(deployBlock) - 1, latestBlock: Number(latestBlock) };
  }

  const chunks = planSyncChunks(fromBlock, safeHead, chunkSize);
  const newEvents: PressEvent[] = [];

  for (const chunk of chunks) {
    const logs = await client.getLogs({ address: contractAddress, fromBlock: chunk.from, toBlock: chunk.to });
    const decoded = logs.map(tryDecodePressedLog).filter((event): event is PressEvent => event !== null);
    if (decoded.length > 0) {
      await putEvents(db, decoded);
      newEvents.push(...decoded);
    }
    // Persisted after every chunk, not just at the end of the whole pass.
    await setSyncCursor(db, Number(chunk.to));
  }

  return { newEvents, cursor: Number(safeHead), latestBlock: Number(latestBlock) };
}

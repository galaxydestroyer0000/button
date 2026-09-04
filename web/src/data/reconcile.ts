import { decodeEventLog, type Log } from "viem";
import { buttonExperimentAbi } from "../abi/buttonExperiment";
import type { PressEvent } from "../domain/types";

export interface BlockRange {
  from: bigint;
  to: bigint;
}

/**
 * Splits [fromBlock, toBlock] into bounded chunks no wider than chunkSize, so a
 * backfill never issues one unbounded eth_getLogs call over the experiment's whole
 * history — the same defensive shape the original hand-rolled RPC layer used, just
 * generalized into a pure, testable planner instead of an inline retry.
 */
export function planSyncChunks(fromBlock: bigint, toBlock: bigint, chunkSize: bigint): BlockRange[] {
  if (chunkSize <= 0n) throw new Error("chunkSize must be positive");
  if (fromBlock > toBlock) return [];

  const chunks: BlockRange[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = cursor + chunkSize - 1n > toBlock ? toBlock : cursor + chunkSize - 1n;
    chunks.push({ from: cursor, to: end });
    cursor = end + 1n;
  }
  return chunks;
}

/**
 * Merges any number of possibly-overlapping event batches into one deduplicated,
 * descending-by-pressNumber list. Dedup is keyed by the tx-hash+log-index identity
 * (not by pressNumber alone) so a reconciliation pass that re-reads an already-synced
 * block range is always safe to merge — the same event just overwrites itself.
 */
export function mergeEvents(...batches: PressEvent[][]): PressEvent[] {
  const byKey = new Map<string, PressEvent>();
  for (const batch of batches) {
    for (const event of batch) byKey.set(event.key, event);
  }
  return [...byKey.values()].sort((a, b) => b.pressNumber - a.pressNumber);
}

/** Decodes one raw `Pressed` log into the app's canonical PressEvent shape. */
export function decodePressedLog(log: Pick<Log, "data" | "topics" | "transactionHash" | "blockNumber" | "logIndex">): PressEvent {
  const decoded = decodeEventLog({ abi: buttonExperimentAbi, data: log.data, topics: log.topics, strict: false });
  if (decoded.eventName !== "Pressed") {
    throw new Error(`decodePressedLog received a non-Pressed log: ${decoded.eventName}`);
  }
  const args = decoded.args as { presser: `0x${string}`; remaining: number; faction: number; timestamp: bigint; pressNumber: bigint };
  return {
    key: `${log.transactionHash}:${log.logIndex}`,
    txHash: log.transactionHash ?? "",
    presser: args.presser,
    remaining: Number(args.remaining),
    faction: Number(args.faction),
    timestamp: Number(args.timestamp),
    pressNumber: Number(args.pressNumber),
    blockNumber: Number(log.blockNumber ?? 0n),
    logIndex: Number(log.logIndex ?? 0)
  };
}

/** Best-effort decode: returns null instead of throwing for a log that isn't `Pressed`
 *  or isn't decodable (e.g. an unrelated event from the same address). */
export function tryDecodePressedLog(log: Pick<Log, "data" | "topics" | "transactionHash" | "blockNumber" | "logIndex">): PressEvent | null {
  try {
    return decodePressedLog(log);
  } catch {
    return null;
  }
}

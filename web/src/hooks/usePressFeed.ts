import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import type { AbiEvent } from "viem";
import { buttonExperimentAbi } from "../abi/buttonExperiment";
import { runtimeConfig } from "../config/runtimeConfig";
import { playTone } from "../audio/tick";
import type { ExperimentState, PressEvent } from "../domain/types";

const PRESSED_EVENT = buttonExperimentAbi.find((item) => item.type === "event" && item.name === "Pressed")!;

export interface PressFeed {
  events: PressEvent[];
  freshness: "SYNCING" | "LIVE · ONCHAIN" | "TAPE STALE";
  latestKey: string;
}

export function usePressFeed(state: ExperimentState): PressFeed {
  const [feed, setFeed] = useState<PressFeed>({ events: [], freshness: "SYNCING", latestKey: "" });
  const publicClient = usePublicClient({ chainId: runtimeConfig.network.chainId });
  const latestKeyRef = useRef("");

  useEffect(() => {
    if (runtimeConfig.previewMode || !state.loaded || !publicClient) return;
    const contract = runtimeConfig.contractAddress as `0x${string}`;
    let cancelled = false;

    async function refresh() {
      try {
        const fromBlock = runtimeConfig.deployBlock ?? BigInt(Math.max(0, state.currentBlock - 20_000));
        let logs;
        try {
          logs = await publicClient!.getLogs({
            address: contract,
            event: PRESSED_EVENT as unknown as AbiEvent,
            fromBlock,
            toBlock: "latest"
          });
        } catch {
          logs = await publicClient!.getLogs({
            address: contract,
            event: PRESSED_EVENT as unknown as AbiEvent,
            fromBlock: BigInt(Math.max(0, state.currentBlock - 5_000)),
            toBlock: "latest"
          });
        }

        const decoded: PressEvent[] = logs
          .map((log) => {
            const args = (log as unknown as { args: { presser: `0x${string}`; remaining: bigint; faction: bigint; timestamp: bigint; pressNumber: bigint } }).args;
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
          })
          .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);

        if (cancelled) return;
        const nextKey = decoded[0]?.key || "";
        if (latestKeyRef.current && nextKey && nextKey !== latestKeyRef.current) {
          playTone(920, 0.07, 0.035);
        }
        latestKeyRef.current = nextKey;
        setFeed({ events: decoded.slice(0, 25), freshness: "LIVE · ONCHAIN", latestKey: nextKey });
      } catch (error) {
        if (cancelled) return;
        console.warn("Log refresh failed", error);
        setFeed((prev) => ({ ...prev, freshness: "TAPE STALE" }));
      }
    }

    refresh();
    const interval = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [publicClient, state.loaded, state.currentBlock]);

  return feed;
}

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { buttonExperimentAbi } from "../abi/buttonExperiment";
import { runtimeConfig } from "../config/runtimeConfig";
import type { ExperimentState } from "../domain/types";

const INITIAL_STATE: ExperimentState = {
  loaded: false,
  stale: false,
  started: false,
  alive: false,
  startedAt: 0,
  deadline: 0,
  totalPresses: 0,
  closestCall: 0,
  factionCounts: [0, 0, 0, 0, 0, 0, 0],
  currentBlock: 0,
  chainOffsetMs: 0,
  error: null
};

export function useExperimentState(): ExperimentState {
  const [state, setState] = useState<ExperimentState>(INITIAL_STATE);
  const publicClient = usePublicClient({ chainId: runtimeConfig.network.chainId });

  useEffect(() => {
    if (runtimeConfig.previewMode || !publicClient) return;
    const contract = runtimeConfig.contractAddress as `0x${string}`;
    let cancelled = false;

    async function refresh() {
      try {
        const code = await publicClient!.getCode({ address: contract });
        if (!code || code === "0x") throw new Error("No contract code at configured address");

        const [block, started, startedAt, deadline, totalPresses, closestCall, alive, ...counts] = await Promise.all([
          publicClient!.getBlock({ blockTag: "latest" }),
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "started" }),
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "startedAt" }),
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "deadline" }),
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "totalPresses" }),
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "closestCall" }),
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "isAlive" }),
          ...[1, 2, 3, 4, 5, 6].map((i) =>
            publicClient!.readContract({
              address: contract,
              abi: buttonExperimentAbi,
              functionName: "factionCounts",
              args: [BigInt(i)]
            })
          )
        ]);

        if (cancelled) return;
        const chainOffsetMs = Number(block.timestamp) * 1000 - Date.now();
        setState({
          loaded: true,
          stale: false,
          started: started as boolean,
          alive: alive as boolean,
          startedAt: Number(startedAt),
          deadline: Number(deadline),
          totalPresses: Number(totalPresses),
          closestCall: Number(closestCall),
          factionCounts: [0, ...counts.map((c) => Number(c))] as ExperimentState["factionCounts"],
          currentBlock: Number(block.number),
          chainOffsetMs,
          error: null
        });
      } catch (error) {
        if (cancelled) return;
        console.warn("Core state refresh failed", error);
        setState((prev) => ({
          ...prev,
          stale: prev.loaded,
          error: prev.loaded
            ? "RPC DEGRADED · LAST KNOWN STATE PRESERVED"
            : `RPC ERROR · ${error instanceof Error ? error.message : "UNKNOWN"}`
        }));
      }
    }

    refresh();
    const interval = setInterval(refresh, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [publicClient]);

  return state;
}

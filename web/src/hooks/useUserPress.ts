import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { buttonExperimentAbi } from "../abi/buttonExperiment";
import { runtimeConfig } from "../config/runtimeConfig";
import type { UserPressState } from "../domain/types";

const INITIAL_STATE: UserPressState = { loaded: false, stale: false, hasPressed: false, faction: 0, remaining: 0 };

export function useUserPress(): UserPressState {
  const [state, setState] = useState<UserPressState>(INITIAL_STATE);
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: runtimeConfig.network.chainId });

  useEffect(() => {
    if (runtimeConfig.previewMode || !address || !publicClient) {
      setState(INITIAL_STATE);
      return;
    }
    const contract = runtimeConfig.contractAddress as `0x${string}`;
    let cancelled = false;

    async function refresh() {
      try {
        const [hasPressed, faction, remaining] = await Promise.all([
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "hasPressed", args: [address!] }),
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "pressFaction", args: [address!] }),
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "pressRemaining", args: [address!] })
        ]);
        if (cancelled) return;
        setState({ loaded: true, stale: false, hasPressed: hasPressed as boolean, faction: Number(faction), remaining: Number(remaining) });
      } catch (error) {
        if (cancelled) return;
        console.warn("User-state read failed", error);
        // Never leave this permanently "loading" on a persistent RPC failure, and
        // never let it silently stay "not pressed" either — an already-pressed
        // wallet whose personal read keeps failing must not be shown as eligible to
        // press again. `stale` degrades the UI (blocks pressing, explains why)
        // whether this is the first read ever or a later one going bad.
        setState((prev) => ({ ...prev, stale: true }));
      }
    }

    refresh();
    const interval = setInterval(refresh, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [address, publicClient]);

  return state;
}

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { buttonExperimentAbi } from "../abi/buttonExperiment";
import { runtimeConfig } from "../config/runtimeConfig";

export interface WalletPressLookup {
  status: "loading" | "invalid-address" | "ready";
  hasPressed: boolean;
  faction: number;
  remaining: number;
  pressNumber: number;
}

const EMPTY: Omit<WalletPressLookup, "status"> = { hasPressed: false, faction: 0, remaining: 0, pressNumber: 0 };

/**
 * A wallet's one permanent identity, read directly from the contract's own per-wallet
 * mappings — not derived from the event log. The contract already knows this for any
 * address, so there's no need to scan history to answer "did this wallet press, and
 * with what result".
 */
export function useWalletPress(address: string): WalletPressLookup {
  const [result, setResult] = useState<WalletPressLookup>({ status: "loading", ...EMPTY });
  const publicClient = usePublicClient({ chainId: runtimeConfig.network.chainId });
  const isValid = /^0x[a-fA-F0-9]{40}$/.test(address);

  useEffect(() => {
    if (runtimeConfig.previewMode) {
      setResult({ status: "ready", ...EMPTY });
      return;
    }
    if (!isValid) {
      setResult({ status: "invalid-address", ...EMPTY });
      return;
    }
    if (!publicClient) return;
    let cancelled = false;
    const contract = runtimeConfig.contractAddress as `0x${string}`;
    const wallet = address as `0x${string}`;

    Promise.all([
      publicClient.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "hasPressed", args: [wallet] }),
      publicClient.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "pressFaction", args: [wallet] }),
      publicClient.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "pressRemaining", args: [wallet] }),
      publicClient.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "pressNumber", args: [wallet] })
    ])
      .then(([hasPressed, faction, remaining, pressNumber]) => {
        if (cancelled) return;
        setResult({
          status: "ready",
          hasPressed: hasPressed as boolean,
          faction: Number(faction),
          remaining: Number(remaining),
          pressNumber: Number(pressNumber)
        });
      })
      .catch((error) => {
        console.warn("Wallet lookup failed", error);
      });

    return () => {
      cancelled = true;
    };
  }, [publicClient, address, isValid]);

  return result;
}

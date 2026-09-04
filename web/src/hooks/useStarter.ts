import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { buttonExperimentAbi } from "../abi/buttonExperiment";
import { runtimeConfig } from "../config/runtimeConfig";

/** The contract's own immutable `starter` address — the only wallet resetTimer()
 *  and start() will ever accept. Read live, never assumed, so the admin page can
 *  tell a connected-but-wrong wallet apart from the real one before it ever
 *  attempts a transaction the contract would just reject anyway. */
export function useStarter(): { starter: `0x${string}` | null; loaded: boolean } {
  const [starter, setStarter] = useState<`0x${string}` | null>(null);
  const [loaded, setLoaded] = useState(false);
  const publicClient = usePublicClient({ chainId: runtimeConfig.network.chainId });

  useEffect(() => {
    if (runtimeConfig.previewMode || !publicClient) return;
    let cancelled = false;
    publicClient
      .readContract({ address: runtimeConfig.contractAddress as `0x${string}`, abi: buttonExperimentAbi, functionName: "starter" })
      .then((result) => {
        if (cancelled) return;
        setStarter(result as `0x${string}`);
        setLoaded(true);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("Starter address read failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  return { starter, loaded };
}

import { useEffect, useMemo, useState } from "react";
import { useAccount, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import StatusPill from "../common/StatusPill";
import CountdownDisplay from "./CountdownDisplay";
import PressButton from "./PressButton";
import PressStatusLine from "./PressStatusLine";
import { useExperimentState } from "../../hooks/useExperimentState";
import { usePressFeed } from "../../hooks/usePressFeed";
import { useUserPress } from "../../hooks/useUserPress";
import { useCountdown } from "../../hooks/useCountdown";
import { usePreviewClock } from "../../hooks/usePreviewClock";
import { buttonExperimentAbi } from "../../abi/buttonExperiment";
import { runtimeConfig } from "../../config/runtimeConfig";
import styles from "./PressStage.module.css";

export default function PressStage() {
  const state = useExperimentState();
  const feed = usePressFeed(state);
  const userPress = useUserPress();
  const preview = usePreviewClock();
  const { address, isConnected, chainId, connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [txStatus, setTxStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  const wrongNetwork = !runtimeConfig.previewMode && isConnected && chainId !== runtimeConfig.network.chainId;

  const deadlineMs = runtimeConfig.previewMode ? preview.deadlineMs : state.loaded ? state.deadline * 1000 - state.chainOffsetMs : null;
  const sealed = runtimeConfig.previewMode ? false : !state.started;
  const alive = runtimeConfig.previewMode ? preview.deadlineMs > Date.now() : state.started && state.alive;
  const reading = useCountdown(deadlineMs, { sealed, alive });
  const previewEnded = runtimeConfig.previewMode && !alive;

  const deadlineLabel = runtimeConfig.previewMode
    ? previewEnded
      ? "LOCAL PREVIEW HAS EXPIRED"
      : "LOCAL DEMO · NO BLOCKCHAIN STATE"
    : !state.started
      ? "AWAITING ONE-TIME ACTIVATION"
      : state.alive
        ? `DEADLINE · ${new Date(state.deadline * 1000).toLocaleTimeString([], { hour12: false })}`
        : `ENDED · ${new Date(state.deadline * 1000).toLocaleString()}`;

  const statusLabel = runtimeConfig.previewMode
    ? previewEnded
      ? "PREVIEW ENDED · NOT ONCHAIN"
      : "PREVIEW CLOCK RUNNING · NOT ONCHAIN"
    : !state.loaded
      ? "LOADING SHARED STATE"
      : state.stale
        ? "RPC STALE · SHOWING LAST KNOWN STATE"
        : !state.started
          ? "THE BUTTON IS SEALED"
          : state.alive
            ? "EXPERIMENT LIVE · SHARED CLOCK RUNNING"
            : "EXPERIMENT ENDED · HISTORY FROZEN";

  const statusTone = runtimeConfig.previewMode
    ? previewEnded ? "dead" : "stale"
    : !state.loaded
      ? ""
      : state.stale
        ? "stale"
        : !state.started
          ? ""
          : state.alive
            ? "live"
            : "dead";

  const already = !runtimeConfig.previewMode && Boolean(address) && userPress.loaded && userPress.hasPressed;

  const buttonLabel = runtimeConfig.previewMode
    ? previewEnded ? "ENDED" : preview.pressed ? "SPENT" : "PRESS"
    : !state.loaded
      ? "WAIT"
      : !state.started
        ? "SEALED"
        : !state.alive
          ? "ENDED"
          : already
            ? "SPENT"
            : state.stale
              ? "STALE"
              : pending
                ? "PENDING"
                : wrongNetwork
                  ? "SWITCH"
                  : "PRESS";

  const buttonDisabled = runtimeConfig.previewMode
    ? previewEnded || preview.pressed
    : !state.loaded || !state.started || !state.alive || already || state.stale || pending;

  useEffect(() => {
    if (!receipt.data) return;
    if (receipt.data.status !== "success") {
      setTxStatus("PRESS FAILED · Transaction reverted. The clock may have expired or your wallet had already pressed.");
      setPending(false);
      return;
    }
    setTxStatus("CONFIRMED ON ROBINHOOD CHAIN · YOUR PRESS IS PERMANENT");
    setPending(false);
  }, [receipt.data]);

  async function handlePress() {
    if (runtimeConfig.previewMode) {
      preview.press();
      setTxStatus("PREVIEW PRESS RECORDED LOCALLY · NO TRANSACTION WAS SENT");
      return;
    }
    if (!state.started || !state.alive || state.stale) return;
    if (!isConnected || !address) {
      setTxStatus("NO WALLET CONNECTED · USE THE CONNECT WALLET BUTTON ABOVE");
      return;
    }
    if (already) return;

    try {
      if (wrongNetwork) {
        setTxStatus(`SWITCHING TO ${runtimeConfig.network.name.toUpperCase()}…`);
        await switchChainAsync({ chainId: runtimeConfig.network.chainId });
        return;
      }
      setTxStatus("AWAITING YOUR ONE IRREVERSIBLE PRESS IN WALLET…");
      setPending(true);
      const hash = await writeContractAsync({
        address: runtimeConfig.contractAddress as `0x${string}`,
        abi: buttonExperimentAbi,
        functionName: "press",
        account: address,
        connector
      });
      setTxHash(hash);
      setTxStatus(`SUBMITTED · CONFIRMING…`);
    } catch (error: unknown) {
      const err = error as { code?: number; cause?: { code?: number }; message?: string };
      const rejected = err?.code === 4001 || err?.cause?.code === 4001;
      setTxStatus(
        rejected
          ? "PRESS REJECTED IN WALLET · YOUR ONE PRESS IS STILL UNUSED"
          : `PRESS FAILED · ${err?.message || "STATE CHANGED BEFORE CONFIRMATION"}`
      );
      setPending(false);
    }
  }

  const identity = useMemo(
    () =>
      runtimeConfig.previewMode
        ? { connected: true, loaded: true, hasPressed: preview.pressed, faction: preview.faction, remaining: preview.remaining, txHash: "" }
        : { connected: Boolean(address), loaded: userPress.loaded, hasPressed: userPress.hasPressed, faction: userPress.faction, remaining: userPress.remaining, txHash: txHash || "" },
    [address, userPress, preview.pressed, preview.faction, preview.remaining, txHash]
  );

  return (
    <section className={styles.hero} id="experiment">
      <StatusPill label={statusLabel} tone={statusTone as "" | "live" | "dead" | "stale"} />
      <CountdownDisplay reading={reading} deadlineLabel={deadlineLabel} pulseKey={feed.latestKey} />
      <PressButton label={buttonLabel} disabled={buttonDisabled} onPress={handlePress} />
      <PressStatusLine identity={identity} txStatus={txStatus} />
    </section>
  );
}

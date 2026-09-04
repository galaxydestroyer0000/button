import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { decodeEventLog, type TransactionReceipt } from "viem";
import StatusPill from "../common/StatusPill";
import CountdownDisplay from "./CountdownDisplay";
import PressButton from "./PressButton";
import PressStatusLine from "./PressStatusLine";
import DeadState from "./DeadState";
import { useCountdown } from "../../hooks/useCountdown";
import { buttonExperimentAbi } from "../../abi/buttonExperiment";
import { runtimeConfig } from "../../config/runtimeConfig";
import { explainRevert } from "../../lib/explainRevert";
import type { ExperimentState, PressFeed, UserPressState } from "../../domain/types";
import type { EventSyncStatus } from "../../hooks/useEventSync";
import type { PreviewClockState } from "../../hooks/usePreviewClock";
import styles from "./PressStage.module.css";

interface ConfirmedPress {
  remaining: number;
  faction: number;
  pressNumber: number;
}

const REVERT_REASON_MESSAGES: Record<string, string> = {
  ExperimentEnded: "THE EXPERIMENT ENDED BEFORE YOUR TRANSACTION WAS MINED",
  AlreadyPressed: "YOUR WALLET HAD ALREADY PRESSED BEFORE THIS TRANSACTION WAS MINED",
  NotStarted: "THE EXPERIMENT WAS NOT YET ACTIVE WHEN THIS TRANSACTION WAS MINED"
};

export default function PressStage({
  state,
  feed,
  preview,
  userPress,
  sync
}: {
  state: ExperimentState;
  feed: PressFeed;
  preview: PreviewClockState;
  userPress: UserPressState;
  sync: EventSyncStatus;
}) {
  const { address, isConnected, chainId, connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: runtimeConfig.network.chainId });
  const [txStatus, setTxStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [confirmedPress, setConfirmedPress] = useState<ConfirmedPress | null>(null);
  // Synchronous guard against rapid double-clicks: `pending` state disables the DOM
  // button too, but only after React's next render — a fast double-click can fire
  // this handler twice before that paint lands. This ref closes that window exactly.
  const submittingRef = useRef(false);

  const handleReplaced = useCallback((response: { reason: "cancelled" | "replaced" | "repriced"; transaction: { hash: `0x${string}` } }) => {
    setTxHash(response.transaction.hash);
    if (response.reason === "cancelled") {
      setTxStatus("YOUR WALLET CANCELLED THE PENDING TRANSACTION · YOUR ONE PRESS IS STILL UNUSED");
      setPending(false);
      return;
    }
    setTxStatus(
      response.reason === "repriced"
        ? "TRANSACTION FEE WAS BUMPED IN YOUR WALLET · STILL CONFIRMING…"
        : "TRANSACTION WAS REPLACED IN YOUR WALLET · CONFIRMING THE NEW ONE…"
    );
  }, []);

  const receipt = useWaitForTransactionReceipt({ hash: txHash, onReplaced: handleReplaced });

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

  // A wallet whose personal read has failed (first attempt or a later one) is
  // treated the same as core-state staleness: we refuse to guess eligibility rather
  // than let a possibly-already-pressed wallet see an enabled PRESS button. The
  // brief window before the *first* read ever resolves is not staleness — nothing
  // has failed yet — so this only trips once a read actually errors.
  const userPressUntrustworthy = !runtimeConfig.previewMode && Boolean(address) && userPress.stale;

  const statusLabel = runtimeConfig.previewMode
    ? previewEnded
      ? "PREVIEW ENDED · NOT ONCHAIN"
      : "PREVIEW CLOCK RUNNING · NOT ONCHAIN"
    : !state.loaded
      ? state.error || "LOADING SHARED STATE"
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
      ? state.error ? "stale" : ""
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
            : state.stale || userPressUntrustworthy
              ? "STALE"
              : pending
                ? "PENDING"
                : wrongNetwork
                  ? "SWITCH"
                  : "PRESS";

  const buttonDisabled = runtimeConfig.previewMode
    ? previewEnded || preview.pressed
    : !state.loaded || !state.started || !state.alive || already || state.stale || userPressUntrustworthy || pending;

  const explainPressRevert = useCallback(
    (blockNumber: bigint, account: `0x${string}`) =>
      explainRevert({
        publicClient,
        contractAddress: runtimeConfig.contractAddress as `0x${string}`,
        functionName: "press",
        account,
        blockNumber,
        reasonMessages: REVERT_REASON_MESSAGES
      }),
    [publicClient]
  );

  /// Handles one finalized (mined) receipt, success or reverted — shared by both
  /// branches below so a revert always gets the same correctly-decoded explanation
  /// regardless of which path surfaced the receipt.
  const processReceipt = useCallback(
    async (finalReceipt: TransactionReceipt, account: `0x${string}`) => {
      if (finalReceipt.status !== "success") {
        setTxStatus("PRESS FAILED · Transaction reverted. Checking why…");
        const reason = await explainPressRevert(finalReceipt.blockNumber, account);
        setTxStatus(`PRESS FAILED · ${reason}`);
        setPending(false);
        return;
      }

      // The contract's own event is the sole source of truth for what actually
      // happened — never the value the countdown showed when the user clicked.
      for (const log of finalReceipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: buttonExperimentAbi, data: log.data, topics: log.topics, strict: false });
          if (decoded.eventName === "Pressed") {
            const args = decoded.args as { remaining: number; faction: number; pressNumber: bigint };
            setConfirmedPress({ remaining: Number(args.remaining), faction: Number(args.faction), pressNumber: Number(args.pressNumber) });
            break;
          }
        } catch {
          // Not our event (or not decodable) — skip it and keep scanning the receipt's logs.
        }
      }
      setTxStatus("CONFIRMED ON ROBINHOOD CHAIN · YOUR PRESS IS PERMANENT");
      setPending(false);
    },
    [explainPressRevert]
  );

  useEffect(() => {
    if (!txHash) return;

    if (receipt.data) {
      if (address) processReceipt(receipt.data, address);
      return;
    }

    if (receipt.isError) {
      // wagmi's waitForTransactionReceipt (see @wagmi/core's implementation) throws
      // instead of resolving with `data` when the transaction reverted: it replays
      // the call and decodes the reason assuming a legacy Error(string) revert,
      // which produces garbage for this contract's custom errors, then throws
      // regardless of what it decoded. `receipt.data` is consequently *never*
      // populated for a real revert — so every reverted press would otherwise show
      // this raw, undecoded error instead of the friendly explanation below. Fetch
      // the real receipt straight from viem's own publicClient instead, which does
      // not have this throwing behavior, and run it through the same explainRevert
      // path a successful `receipt.data` would have used.
      if (!publicClient || !address) {
        setTxStatus(
          `PRESS STATUS UNKNOWN · ${receipt.error?.message || "The transaction may have been dropped. Check Blockscout for the latest status."}`
        );
        setPending(false);
        return;
      }
      let cancelled = false;
      publicClient
        .getTransactionReceipt({ hash: txHash })
        .then((realReceipt) => {
          if (!cancelled) processReceipt(realReceipt, address);
        })
        .catch(() => {
          if (cancelled) return;
          setTxStatus(
            `PRESS STATUS UNKNOWN · ${receipt.error?.message || "The transaction may have been dropped. Check Blockscout for the latest status."}`
          );
          setPending(false);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [txHash, receipt.data, receipt.isError, receipt.error, address, publicClient, processReceipt]);

  async function handlePress() {
    if (submittingRef.current) return;

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

    submittingRef.current = true;
    try {
      if (wrongNetwork) {
        setTxStatus(`SWITCHING TO ${runtimeConfig.network.name.toUpperCase()}…`);
        await switchChainAsync({ chainId: runtimeConfig.network.chainId });
        return;
      }
      setTxStatus("CONFIRM YOUR ONE IRREVERSIBLE PRESS IN YOUR WALLET…");
      setPending(true);
      setConfirmedPress(null);
      const hash = await writeContractAsync({
        address: runtimeConfig.contractAddress as `0x${string}`,
        abi: buttonExperimentAbi,
        functionName: "press",
        account: address,
        connector
      });
      setTxHash(hash);
      setTxStatus("SUBMITTED · WAITING FOR CHAIN CONFIRMATION…");
    } catch (error: unknown) {
      const err = error as { code?: number; cause?: { code?: number }; message?: string };
      const rejected = err?.code === 4001 || err?.cause?.code === 4001;
      setTxStatus(
        rejected
          ? "PRESS REJECTED IN WALLET · YOUR ONE PRESS IS STILL UNUSED"
          : `PRESS FAILED · ${err?.message || "STATE CHANGED BEFORE CONFIRMATION"}`
      );
      setPending(false);
    } finally {
      submittingRef.current = false;
    }
  }

  const effectiveTxStatus = txStatus || (runtimeConfig.previewMode ? "" : state.error || "");

  // Only real, meaningful once the wallet's own press has actually landed on-chain
  // (or the preview's simulated one) — never a guess about a press that isn't final.
  const isNewClosestCall =
    !runtimeConfig.previewMode &&
    Boolean(address) &&
    userPress.hasPressed &&
    state.closestCallWallet !== "" &&
    state.closestCallWallet.toLowerCase() === address?.toLowerCase();

  const identity = useMemo(
    () =>
      runtimeConfig.previewMode
        ? {
            connected: true,
            loaded: true,
            hasPressed: preview.pressed,
            faction: preview.faction,
            remaining: preview.remaining,
            pressNumber: preview.pressed ? preview.total : 0,
            txHash: "",
            presser: preview.events[0]?.presser ?? "",
            isNewClosestCall: false
          }
        : {
            connected: Boolean(address),
            loaded: userPress.loaded,
            hasPressed: userPress.hasPressed,
            faction: confirmedPress?.faction ?? userPress.faction,
            remaining: confirmedPress?.remaining ?? userPress.remaining,
            pressNumber: confirmedPress?.pressNumber ?? 0,
            txHash: txHash || "",
            presser: address ?? "",
            isNewClosestCall
          },
    [address, userPress, preview.pressed, preview.faction, preview.remaining, preview.total, preview.events, confirmedPress, txHash, isNewClosestCall]
  );

  // Permanent, not a status label swap: once truly dead the whole hero becomes a
  // different screen. Gated on state.loaded in real mode so a page load never
  // flashes "dead" before the first read confirms otherwise.
  const isDead = runtimeConfig.previewMode ? previewEnded : state.loaded && state.started && !state.alive;

  if (isDead) {
    return <DeadState state={state} sync={sync} preview={preview} />;
  }

  return (
    <section className={styles.hero} id="experiment">
      <StatusPill label={statusLabel} tone={statusTone as "" | "live" | "dead" | "stale"} />
      <CountdownDisplay reading={reading} deadlineLabel={deadlineLabel} pulseKey={feed.latestKey} />
      <PressButton label={buttonLabel} disabled={buttonDisabled} onPress={handlePress} />
      <PressStatusLine identity={identity} txStatus={effectiveTxStatus} />
    </section>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { TransactionReceipt } from "viem";
import { buttonExperimentAbi } from "../abi/buttonExperiment";
import { runtimeConfig } from "../config/runtimeConfig";
import { txUrl } from "../config/network";
import { explainRevert } from "../lib/explainRevert";
import { useStarter } from "../hooks/useStarter";
import { useGameState } from "../hooks/useGameState";
import { usePageMeta } from "../lib/pageMeta";
import type { ExperimentState } from "../domain/types";
import styles from "./AdminPage.module.css";

const START_REASONS: Record<string, string> = {
  AlreadyStarted: "THE EXPERIMENT HAS ALREADY BEEN ACTIVATED. start() CAN NEVER BE CALLED AGAIN",
  OnlyStarter: "THIS WALLET IS NOT THE STARTER ADDRESS"
};
const RESET_REASONS: Record<string, string> = {
  ExperimentNotAlive: "THE EXPERIMENT IS NOT CURRENTLY ALIVE. resetTimer() ONLY WORKS BEFORE THE DEADLINE PASSES, NEVER AFTER",
  OnlyStarter: "THIS WALLET IS NOT THE STARTER ADDRESS"
};

const SCHEDULE_STORAGE_KEY = "button-admin-scheduled-start";

/** A hidden, unlinked operator page — never in nav. The contract itself is what
 *  actually enforces every guard here (only the real `starter` wallet can ever
 *  get start()/resetTimer() to succeed); this page's own checks exist purely to
 *  keep a wrong-wallet visitor from wasting gas on a call the contract will
 *  reject anyway, and to make the two admin actions safe and legible to use. */
export default function AdminPage({ state }: { state: ExperimentState }) {
  usePageMeta({ title: "Admin", description: "Operator controls for ButtonExperiment: start the clock, or reset it while alive." });

  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: runtimeConfig.network.chainId });
  const { starter, loaded: starterLoaded } = useStarter();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();

  const [pendingAction, setPendingAction] = useState<"start" | "resetTimer" | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [txStatus, setTxStatus] = useState("");
  // The database game (what regular users actually see now) and the real
  // contract are two independent systems this page drives together — but a
  // network blip could still let them diverge. Tracked separately so a failed
  // DB sync surfaces its own retry, rather than being silently swallowed into
  // the onchain status line or requiring a whole new onchain transaction to
  // try again.
  const [dbSyncError, setDbSyncError] = useState<{ action: "start" | "resetTimer"; message: string } | null>(null);
  const [dbSyncing, setDbSyncing] = useState(false);
  const submittingRef = useRef(false);

  const syncDatabase = useCallback(async (action: "start" | "resetTimer") => {
    setDbSyncing(true);
    setDbSyncError(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: action === "start" ? "start" : "reset" })
      });
      const data = await res.json();
      if (!res.ok) {
        setDbSyncError({ action, message: data.message || data.error || "UNKNOWN DATABASE ERROR" });
        return false;
      }
      return true;
    } catch (error) {
      setDbSyncError({ action, message: error instanceof Error ? error.message : "COULD NOT REACH THE SERVER" });
      return false;
    } finally {
      setDbSyncing(false);
    }
  }, []);

  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  const isStarter = Boolean(address && starter && address.toLowerCase() === starter.toLowerCase());
  // Same guard PressStage uses: a connected wallet's *active* chain is whatever it
  // last had selected, completely independent of which chain this page reads from
  // — sending a transaction without checking first sends it wherever the wallet
  // currently is, silently, which is exactly how a starter on the wrong network
  // could burn gas confirming a no-op instead of the real start()/resetTimer().
  const wrongNetwork = !runtimeConfig.previewMode && isConnected && chainId !== runtimeConfig.network.chainId;

  const processReceipt = useCallback(
    async (finalReceipt: TransactionReceipt, account: `0x${string}`, action: "start" | "resetTimer") => {
      if (finalReceipt.status !== "success") {
        setTxStatus("TRANSACTION REVERTED · CHECKING WHY…");
        const reason = await explainRevert({
          publicClient,
          contractAddress: runtimeConfig.contractAddress as `0x${string}`,
          functionName: action,
          account,
          blockNumber: finalReceipt.blockNumber,
          reasonMessages: action === "start" ? START_REASONS : RESET_REASONS
        });
        setTxStatus(reason);
        setPendingAction(null);
        return;
      }
      setTxStatus(
        action === "start"
          ? "ACTIVATED ONCHAIN · SYNCING THE DATABASE GAME…"
          : "TIMER RESET ONCHAIN · SYNCING THE DATABASE GAME…"
      );
      setPendingAction(null);
      const dbOk = await syncDatabase(action);
      if (dbOk) {
        setTxStatus(
          action === "start"
            ? "ACTIVATED · THE CLOCK IS RUNNING FOR EVERYONE"
            : "TIMER RESET · DEADLINE PUSHED BACK TO A FRESH 60 SECONDS FOR EVERYONE"
        );
      } else {
        setTxStatus(
          `ONCHAIN ${action === "start" ? "ACTIVATION" : "RESET"} SUCCEEDED, BUT THE DATABASE GAME DID NOT SYNC. USE RETRY BELOW.`
        );
      }
    },
    [publicClient, syncDatabase]
  );

  useEffect(() => {
    if (!txHash || !pendingAction || !address) return;

    if (receipt.data) {
      processReceipt(receipt.data, address, pendingAction);
      return;
    }

    if (receipt.isError) {
      // wagmi's waitForTransactionReceipt throws instead of resolving with `data`
      // when the transaction reverted (see PressStage.tsx / SECURITY.md's hostile
      // audit findings for the full root cause) — re-fetch the real receipt
      // directly through viem's own publicClient, which doesn't have this
      // behavior, so a revert here gets the same correctly-decoded explanation
      // press() reverts already get, instead of a raw fallback error.
      if (!publicClient) {
        setTxStatus(`TRANSACTION STATUS UNKNOWN · ${receipt.error?.message || "Check the explorer for the latest status."}`);
        setPendingAction(null);
        return;
      }
      let cancelled = false;
      publicClient
        .getTransactionReceipt({ hash: txHash })
        .then((realReceipt) => {
          if (!cancelled) processReceipt(realReceipt, address, pendingAction);
        })
        .catch(() => {
          if (cancelled) return;
          setTxStatus(`TRANSACTION STATUS UNKNOWN · ${receipt.error?.message || "Check the explorer for the latest status."}`);
          setPendingAction(null);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [txHash, pendingAction, receipt.data, receipt.isError, receipt.error, address, publicClient, processReceipt]);

  async function callAction(action: "start" | "resetTimer") {
    if (submittingRef.current || !address || !isStarter) return;
    submittingRef.current = true;
    try {
      if (wrongNetwork) {
        setTxStatus(`SWITCHING TO ${runtimeConfig.network.name.toUpperCase()}…`);
        await switchChainAsync({ chainId: runtimeConfig.network.chainId });
        return;
      }
      setPendingAction(action);
      setTxStatus(action === "start" ? "CONFIRM ACTIVATION IN YOUR WALLET…" : "CONFIRM TIMER RESET IN YOUR WALLET…");
      const hash = await writeContractAsync({
        address: runtimeConfig.contractAddress as `0x${string}`,
        abi: buttonExperimentAbi,
        functionName: action,
        account: address
      });
      setTxHash(hash);
      setTxStatus("SUBMITTED · WAITING FOR CHAIN CONFIRMATION…");
    } catch (error: unknown) {
      const err = error as { code?: number; cause?: { code?: number }; message?: string };
      const rejected = err?.code === 4001 || err?.cause?.code === 4001;
      setTxStatus(rejected ? "REJECTED IN WALLET · NOTHING CHANGED" : `FAILED · ${err?.message || "STATE CHANGED BEFORE CONFIRMATION"}`);
      setPendingAction(null);
    } finally {
      submittingRef.current = false;
    }
  }

  const scheduling = useScheduledStart({
    enabled: isStarter && !runtimeConfig.previewMode && !state.started,
    onFire: () => callAction("start")
  });

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/admin-logout", { method: "POST" });
    } finally {
      window.location.href = "/";
    }
  }, []);

  if (runtimeConfig.previewMode) {
    return (
      <section className={styles.section}>
        <div className={styles.notice}>PREVIEW MODE HAS NO REAL CONTRACT TO ADMINISTER. CONFIGURE A DEPLOYMENT TO USE THIS PAGE.</div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <div className={styles.headRow}>
          <span className={styles.eyebrow}>ADMIN</span>
          <button type="button" className={styles.signOut} onClick={signOut}>
            SIGN OUT
          </button>
        </div>
        <h2>Operator controls.</h2>
        <p className={styles.lede}>
          This page has no special access to the contract. Everything here is a plain transaction that the contract itself accepts
          only from the real starter wallet and rejects from anyone else. It exists to make two narrow, publicly-visible admin
          actions safe to use, not to add a hidden capability.
        </p>
      </div>

      <div className={styles.facts}>
        <div>
          <span>YOUR WALLET</span>
          <code>{isConnected && address ? address : "NOT CONNECTED"}</code>
        </div>
        <div>
          <span>STARTER (ONLY VALID ADMIN)</span>
          <code>{starterLoaded ? starter : "READING…"}</code>
        </div>
        <div>
          <span>ACCESS</span>
          <code>{!isConnected ? "CONNECT YOUR WALLET ABOVE" : !starterLoaded ? "READING…" : isStarter ? "GRANTED" : "DENIED: WRONG WALLET"}</code>
        </div>
        <div>
          <span>EXPERIMENT STATE</span>
          <code>{!state.loaded ? "READING…" : !state.started ? "SEALED" : state.alive ? "LIVE" : "ENDED (PERMANENT)"}</code>
        </div>
        <div>
          <span>DEADLINE</span>
          <code>{state.loaded && state.started ? new Date(state.deadline * 1000).toLocaleString() : "N/A"}</code>
        </div>
        <div>
          <span>TIMER RESETS USED SO FAR</span>
          <code>{state.loaded ? "see resetTimer() events on the contract's block explorer page" : "N/A"}</code>
        </div>
      </div>

      <div className={styles.actions}>
        <div className={styles.actionCard}>
          <h3>Activate: one time, ever</h3>
          <p>Calls start(). Only works once, only for the starter wallet, only while the experiment is sealed.</p>
          <button
            type="button"
            disabled={!isStarter || state.started || pendingAction !== null}
            onClick={() => callAction("start")}
          >
            {pendingAction === "start" ? "SUBMITTING…" : "START THE EXPERIMENT"}
          </button>
        </div>

        <div className={styles.actionCard}>
          <h3>Reset timer: while alive only</h3>
          <p>Calls resetTimer(). Pushes the deadline back to a fresh 60 seconds. Reverts if not started yet or already ended. Can never revive a dead experiment.</p>
          <button
            type="button"
            disabled={!isStarter || !state.started || !state.alive || pendingAction !== null}
            onClick={() => callAction("resetTimer")}
          >
            {pendingAction === "resetTimer" ? "SUBMITTING…" : "RESET TIMER TO 60s"}
          </button>
        </div>
      </div>

      {txStatus && (
        <div className={styles.txStatus} aria-live="polite">
          {txStatus}
          {txHash && (
            <a href={txUrl(runtimeConfig.network.explorer, txHash)} target="_blank" rel="noopener noreferrer">
              VIEW TRANSACTION ↗
            </a>
          )}
        </div>
      )}

      {dbSyncError && (
        <div className={styles.txStatus} aria-live="polite">
          DATABASE SYNC FAILED ({dbSyncError.action === "start" ? "START" : "RESET"}) · {dbSyncError.message}
          <button type="button" disabled={dbSyncing} onClick={() => syncDatabase(dbSyncError.action)}>
            {dbSyncing ? "RETRYING…" : "RETRY DATABASE SYNC"}
          </button>
        </div>
      )}

      <div className={styles.scheduleCard}>
        <h3>Scheduled activation</h3>
        <p>
          Picks a future time and fires start() automatically once it arrives, <strong>while this exact browser tab stays open and
          your wallet stays connected</strong>. Closing the tab, losing wallet connection, or your computer sleeping will silently
          miss the moment; nothing runs on a server for this. Reopening this page re-arms the same schedule (it's saved locally),
          but only if you're back before the scheduled time.
        </p>
        {!isStarter ? (
          <p className={styles.disabledNotice}>Connect the starter wallet to arm a scheduled start.</p>
        ) : state.started ? (
          <p className={styles.disabledNotice}>Already activated. There's nothing left to schedule.</p>
        ) : (
          <ScheduleControls scheduling={scheduling} />
        )}
      </div>

      <TokenCAControls />
    </section>
  );
}

interface Scheduling {
  scheduledAt: number | null;
  arm: (isoLocal: string) => void;
  disarm: () => void;
  msRemaining: number | null;
}

function useScheduledStart(params: { enabled: boolean; onFire: () => void }): Scheduling {
  const { enabled, onFire } = params;
  const [scheduledAt, setScheduledAt] = useState<number | null>(null);
  const [msRemaining, setMsRemaining] = useState<number | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem(`${SCHEDULE_STORAGE_KEY}-${runtimeConfig.contractAddress}`);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed) && parsed > Date.now()) setScheduledAt(parsed);
    }
  }, []);

  useEffect(() => {
    if (!scheduledAt || !enabled) {
      setMsRemaining(null);
      return;
    }
    const interval = setInterval(() => {
      const remaining = scheduledAt - Date.now();
      setMsRemaining(remaining);
      if (remaining <= 0 && !firedRef.current) {
        firedRef.current = true;
        onFire();
      }
    }, 250);
    return () => clearInterval(interval);
  }, [scheduledAt, enabled, onFire]);

  const arm = useCallback((isoLocal: string) => {
    const time = new Date(isoLocal).getTime();
    if (!Number.isFinite(time) || time <= Date.now()) return;
    firedRef.current = false;
    setScheduledAt(time);
    localStorage.setItem(`${SCHEDULE_STORAGE_KEY}-${runtimeConfig.contractAddress}`, String(time));
  }, []);

  const disarm = useCallback(() => {
    setScheduledAt(null);
    firedRef.current = false;
    localStorage.removeItem(`${SCHEDULE_STORAGE_KEY}-${runtimeConfig.contractAddress}`);
  }, []);

  return { scheduledAt, arm, disarm, msRemaining };
}

function ScheduleControls({ scheduling }: { scheduling: Scheduling }) {
  const [input, setInput] = useState("");

  if (scheduling.scheduledAt) {
    const remaining = scheduling.msRemaining ?? scheduling.scheduledAt - Date.now();
    const seconds = Math.max(0, Math.floor(remaining / 1000));
    const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return (
      <div className={styles.armed}>
        <div>
          ARMED FOR <strong>{new Date(scheduling.scheduledAt).toLocaleString()}</strong>
        </div>
        <div className={styles.countdown}>
          {remaining > 0 ? `STARTS IN ${h}:${m}:${s}` : "FIRING NOW…"}
        </div>
        <button type="button" onClick={scheduling.disarm}>
          DISARM
        </button>
      </div>
    );
  }

  return (
    <div className={styles.scheduleForm}>
      <input type="datetime-local" value={input} onChange={(e) => setInput(e.target.value)} />
      <button type="button" disabled={!input} onClick={() => scheduling.arm(input)}>
        ARM
      </button>
    </div>
  );
}

/** Independent of the onchain start()/resetTimer() flow above — this just
 *  writes game_state.token_ca via POST /api/admin's setTokenCA action, which
 *  every page's CaBanner.tsx reads live. No redeploy, no wallet, no
 *  transaction: it's a plain database value for a plain visibility feature. */
function TokenCAControls() {
  const { tokenCA, loaded } = useGameState();
  const [input, setInput] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!initialized && loaded) {
      setInput(tokenCA ?? "");
      setInitialized(true);
    }
  }, [initialized, loaded, tokenCA]);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "setTokenCA", value: input.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ ok: false, message: data.message || data.error || "UNKNOWN ERROR" });
        return;
      }
      setInput(data.tokenCA ?? "");
      setStatus({
        ok: true,
        message: data.tokenCA ? "SAVED. LIVE ON THE SITE NOW." : 'CLEARED. THE BANNER READS "NOT LAUNCHED" AGAIN.'
      });
    } catch (error) {
      setStatus({ ok: false, message: error instanceof Error ? error.message : "COULD NOT REACH THE SERVER" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.scheduleCard}>
      <h3>Token contract address</h3>
      <p>
        Shown in full, with a copy button, in the banner at the very top of every page. Leave it empty and the banner
        reads "NOT LAUNCHED" instead. Takes effect immediately for every visitor, no redeploy.
      </p>
      <div className={styles.scheduleForm}>
        <input
          type="text"
          className={styles.tokenCaInput}
          placeholder="0x… (leave empty for NOT LAUNCHED)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="button" disabled={saving} onClick={save}>
          {saving ? "SAVING…" : "SAVE"}
        </button>
      </div>
      {status && <p className={status.ok ? styles.tokenCaStatusOk : styles.disabledNotice}>{status.message}</p>}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import type { AbiEvent } from "viem";
import { buttonExperimentAbi } from "../abi/buttonExperiment";
import { runtimeConfig } from "../config/runtimeConfig";
import { openEventDb } from "../data/eventDb";
import { syncEvents } from "../data/sync";
import { mergeEvents } from "../data/reconcile";
import { playTone } from "../audio/tick";
import type { ExperimentState, PressEvent } from "../domain/types";

const PRESSED_EVENT = buttonExperimentAbi.find((item) => item.type === "event" && item.name === "Pressed") as AbiEvent;
const POLL_MS = 6_000;
// The sync cursor never advances past `latestBlock - REORG_CONFIRMATIONS`, and every
// pass re-walks that many blocks behind whatever was previously persisted. Idempotent
// per-event upserts make re-fetching an unchanged block a no-op and correct a reorged
// one. This bounds, not eliminates, reorg risk — see SECURITY.md.
const REORG_CONFIRMATIONS = 5n;

export interface EventSyncStatus {
  db: IDBDatabase | null;
  freshness: "SYNCING" | "LIVE · ONCHAIN" | "TAPE STALE";
  /** Bumps whenever a sync pass persists new events — the signal read-side hooks
   *  (useEventPage, useWindowCounts, useLiveFeed) re-query on. */
  version: number;
  /** The most recently observed event's key, once any sync has completed at least
   *  once (including the very first historical backfill). Used for row-level "is
   *  this the newest row" checks that don't care whether it was just backfilled. */
  latestKey: string;
  /**
   * The event that triggered a GENUINE new-press detection — set only when a sync
   * finds a key different from the previous one, never on the initial historical
   * backfill (there is nothing to "pulse" about history that was already there
   * before this tab opened). This is what the global pulse and the faction-bar
   * highlight key off; `latestKey` alone can't distinguish "just loaded" from
   * "just happened".
   */
  pulseEvent: PressEvent | null;
}

/**
 * Owns the local IndexedDB event store's lifecycle: opens it once the real contract
 * address is known, runs an initial backfill, then polls on a fixed interval —
 * re-triggered immediately on tab-visibility and online events so recovery from a
 * backgrounded tab or a dropped connection doesn't wait for the next tick. Never
 * subscribes to a websocket; every update is a fresh, cursor-based eth_getLogs pass.
 */
export function useEventSync(state: ExperimentState): EventSyncStatus {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [freshness, setFreshness] = useState<EventSyncStatus["freshness"]>("SYNCING");
  const [version, setVersion] = useState(0);
  const [latestKey, setLatestKey] = useState("");
  const [pulseEvent, setPulseEvent] = useState<PressEvent | null>(null);
  const latestKeyRef = useRef("");
  const syncingRef = useRef(false);
  const publicClient = usePublicClient({ chainId: runtimeConfig.network.chainId });

  useEffect(() => {
    if (runtimeConfig.previewMode) return;
    let cancelled = false;
    openEventDb(`button-events-${runtimeConfig.contractAddress}`).then((opened) => {
      if (cancelled) opened.close();
      else setDb(opened);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const runSync = useCallback(async () => {
    if (!db || !publicClient || syncingRef.current) return;
    syncingRef.current = true;
    try {
      const result = await syncEvents({
        db,
        client: {
          getBlockNumber: () => publicClient.getBlockNumber(),
          getLogs: (params) => publicClient.getLogs({ ...params, event: PRESSED_EVENT })
        },
        contractAddress: runtimeConfig.contractAddress as `0x${string}`,
        deployBlock: runtimeConfig.deployBlock ?? 0n,
        confirmations: REORG_CONFIRMATIONS
      });

      if (result.newEvents.length > 0) {
        const newest = mergeEvents(result.newEvents)[0];
        if (latestKeyRef.current && newest.key !== latestKeyRef.current) {
          playTone(920, 0.07, 0.035);
          setPulseEvent(newest);
        }
        latestKeyRef.current = newest.key;
        setLatestKey(newest.key);
      }
      setFreshness("LIVE · ONCHAIN");
      setVersion((v) => v + 1);
    } catch (error) {
      console.warn("Event sync failed", error);
      setFreshness("TAPE STALE");
    } finally {
      syncingRef.current = false;
    }
  }, [db, publicClient]);

  useEffect(() => {
    if (!db || !publicClient || !state.loaded) return;
    runSync();
    const interval = setInterval(runSync, POLL_MS);

    function handleVisibility() {
      if (document.visibilityState === "visible") runSync();
    }
    function handleOnline() {
      runSync();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [db, publicClient, state.loaded, runSync]);

  return { db, freshness, version, latestKey, pulseEvent };
}

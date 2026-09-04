import { txUrl } from "../../config/network";
import { runtimeConfig } from "../../config/runtimeConfig";
import IdentityCard from "../identity/IdentityCard";
import styles from "./PressStatusLine.module.css";

export interface IdentityInfo {
  connected: boolean;
  loaded: boolean;
  hasPressed: boolean;
  faction: number;
  remaining: number;
  pressNumber: number;
  txHash: string;
  presser: string;
  isNewClosestCall?: boolean;
}

export default function PressStatusLine({ identity, txStatus }: { identity: IdentityInfo; txStatus: string }) {
  let identityLine = "YOU ARE GREY · YOU HAVE NOT PRESSED";

  if (!runtimeConfig.previewMode && !identity.connected) {
    identityLine = "CONNECT A WALLET TO REVEAL YOUR STATUS";
  } else if (!runtimeConfig.previewMode && identity.connected && !identity.loaded) {
    identityLine = "READING YOUR ONCHAIN STATUS…";
  }

  return (
    <>
      <div className={styles.kicker}>
        <span>REDDIT, 2015</span>
        <span className={styles.arrow}>→</span>
        <span>ROBINHOOD CHAIN, 2026</span>
      </div>
      <div className={styles.rule}>
        ONE WALLET. ONE PRESS. <strong>FOREVER.</strong>
      </div>
      {/* Once pressed, the card below says everything this line would have said —
          showing both is pure redundancy, so it steps aside instead of stacking. */}
      {!identity.hasPressed && <div className={styles.identity}>{identityLine}</div>}
      <div className={styles.txStatus} aria-live="polite">{txStatus}</div>
      {identity.hasPressed && (
        // CSS-only entrance animation: this block only ever mounts once, exactly when
        // hasPressed first flips true, so DOM insertion itself is the reveal trigger
        // — no extra "just confirmed" state needed, and it works identically for a
        // real confirmed transaction and a local preview press.
        <div className={`${styles.postPress} ${styles.reveal}`}>
          <IdentityCard
            shareable
            data={{
              pressNumber: identity.pressNumber,
              remaining: identity.remaining,
              faction: identity.faction,
              presser: identity.presser,
              isNewClosestCall: identity.isNewClosestCall
            }}
          />
          {identity.txHash && (
            <a className={styles.txLink} href={txUrl(runtimeConfig.network.explorer, identity.txHash)} target="_blank" rel="noopener noreferrer">
              VIEW TRANSACTION ↗
            </a>
          )}
        </div>
      )}
    </>
  );
}

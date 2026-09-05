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
  const identityLine = identity.connected ? "YOU ARE GREY · YOU HAVE NOT PRESSED" : "PICK A USERNAME TO REVEAL YOUR STATUS";

  return (
    <>
      <div className={styles.kicker}>
        <span>REDDIT, 2015</span>
        <span className={styles.arrow}>→</span>
        <span>BUTTON, 2026</span>
      </div>
      <div className={styles.rule}>
        ONE USERNAME. ONE PRESS. <strong>FOREVER.</strong>
      </div>
      {/* Once pressed, the card below says everything this line would have said —
          showing both is pure redundancy, so it steps aside instead of stacking. */}
      {!identity.hasPressed && <div className={styles.identity}>{identityLine}</div>}
      <div className={styles.txStatus} aria-live="polite">{txStatus}</div>
      {identity.hasPressed && (
        // CSS-only entrance animation: this block only ever mounts once, exactly when
        // hasPressed first flips true, so DOM insertion itself is the reveal trigger.
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
        </div>
      )}
    </>
  );
}

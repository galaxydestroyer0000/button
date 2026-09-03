import { FACTIONS } from "../../domain/factions";
import { txUrl } from "../../config/network";
import { runtimeConfig } from "../../config/runtimeConfig";
import styles from "./PressStatusLine.module.css";

export interface IdentityInfo {
  connected: boolean;
  loaded: boolean;
  hasPressed: boolean;
  faction: number;
  remaining: number;
  txHash: string;
}

export default function PressStatusLine({ identity, txStatus }: { identity: IdentityInfo; txStatus: string }) {
  let identityLine = "YOU ARE GREY · YOU HAVE NOT PRESSED";
  let identityColor = FACTIONS[0].color;

  if (!runtimeConfig.previewMode && !identity.connected) {
    identityLine = "CONNECT A WALLET TO REVEAL YOUR STATUS";
    identityColor = "";
  } else if (!runtimeConfig.previewMode && identity.connected && !identity.loaded) {
    identityLine = "READING YOUR ONCHAIN STATUS…";
    identityColor = "";
  } else if (identity.hasPressed) {
    const f = FACTIONS[identity.faction];
    identityLine = `YOU ARE ${f.name} · YOUR ONE PRESS IS SPENT`;
    identityColor = f.color;
  }

  const share = identity.hasPressed
    ? `I pressed BUTTON at ${identity.remaining} seconds. ${FACTIONS[identity.faction].name}. One press forever. $BUTTON / RDDT`
    : "";

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
      <div className={styles.identity} style={identityColor ? { color: identityColor } : undefined}>
        {identityLine}
      </div>
      <div className={styles.txStatus} aria-live="polite">{txStatus}</div>
      {identity.hasPressed && (
        <div className={styles.postPress}>
          <strong style={{ color: FACTIONS[identity.faction].color }}>
            YOU PRESSED AT {String(identity.remaining).padStart(2, "0")}s — {FACTIONS[identity.faction].name}
          </strong>
          {identity.txHash && (
            <a href={txUrl(runtimeConfig.network.explorer, identity.txHash)} target="_blank" rel="noopener noreferrer">
              TX ↗
            </a>
          )}
          <button type="button" onClick={() => navigator.clipboard?.writeText(share).catch(() => {})}>
            COPY
          </button>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(share)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            SHARE ON X ↗
          </a>
        </div>
      )}
    </>
  );
}

import { FACTIONS } from "../../domain/factions";
import { numberToWord, shortAddress } from "../../domain/format";
import { downloadIdentityCard } from "../../lib/shareCard";
import styles from "./IdentityCard.module.css";

export interface IdentityCardData {
  pressNumber: number;
  remaining: number;
  faction: number;
  presser: string;
  isNewClosestCall?: boolean;
}

/**
 * BUTTON's one piece of manufactured culture: an identity built entirely around
 * WHEN someone pressed — no points, no rewards, nothing to farm. The quote line is
 * generated, not authored; every faction gets one short seed, not a story.
 */
export default function IdentityCard({ data, shareable = false }: { data: IdentityCardData; shareable?: boolean }) {
  const f = FACTIONS[data.faction] ?? FACTIONS[0];
  const share = `I pressed BUTTON at ${data.remaining} seconds.\n${f.name}.\nOne press forever.\n$BUTTON / RDDT`;

  return (
    <div className={styles.card} style={{ ["--fc" as string]: f.color }}>
      <div className={styles.top}>
        <span className={styles.pressNumber}>PRESS #{data.pressNumber.toLocaleString()}</span>
        {data.isNewClosestCall && <span className={styles.record}>NEW CLOSEST CALL</span>}
      </div>

      <div className={styles.readout}>
        <span className={styles.seconds}>{data.remaining}</span>
        <span className={styles.unit}>SECOND{data.remaining === 1 ? "" : "S"}</span>
      </div>
      <div className={styles.faction}>{f.name}</div>
      <div className={styles.wallet}>{data.presser.startsWith("0x") ? shortAddress(data.presser) : data.presser || "N/A"}</div>

      <div className={styles.quote}>&ldquo;I waited until {numberToWord(data.remaining)}.&rdquo;</div>

      <div className={styles.actions}>
        <button type="button" onClick={() => downloadIdentityCard(data)}>
          DOWNLOAD
        </button>
        {shareable && (
          <>
            <button type="button" onClick={() => navigator.clipboard?.writeText(share).catch(() => {})}>
              COPY
            </button>
            <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer">
              SHARE ON X ↗
            </a>
          </>
        )}
      </div>
    </div>
  );
}

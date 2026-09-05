import { useParams } from "react-router-dom";
import { FACTIONS } from "../domain/factions";
import { shortAddress } from "../domain/format";
import { txUrl, addressUrl } from "../config/network";
import { runtimeConfig } from "../config/runtimeConfig";
import { usePressByNumber } from "../hooks/usePressByNumber";
import { usePageMeta } from "../lib/pageMeta";
import IdentityCard from "../components/identity/IdentityCard";
import type { ExperimentState } from "../domain/types";
import type { EventSyncStatus } from "../hooks/useEventSync";
import styles from "./PressPage.module.css";

export default function PressPage({ state, sync }: { state: ExperimentState; sync: EventSyncStatus }) {
  const params = useParams<{ number: string }>();
  const pressNumber = Number(params.number);
  const valid = Number.isInteger(pressNumber) && pressNumber >= 1;
  const lookup = usePressByNumber(sync, valid ? pressNumber : -1, state.totalPresses);

  const foundFaction = lookup.event ? FACTIONS[lookup.event.faction] : null;
  usePageMeta(
    lookup.status === "found" && lookup.event
      ? {
          title: `Press #${lookup.event.pressNumber.toLocaleString()} · ${foundFaction?.name}, ${lookup.event.remaining}s`,
          description: `${shortAddress(lookup.event.presser)} pressed BUTTON at ${lookup.event.remaining} seconds. ${foundFaction?.name}. One press forever.`
        }
      : null
  );

  if (runtimeConfig.previewMode) {
    return (
      <section className={styles.section}>
        <div className={styles.notice}>PREVIEW MODE HAS NO INDEXED PRESSES. CONFIGURE A CONTRACT TO LOOK ONE UP.</div>
      </section>
    );
  }

  if (!valid) {
    return (
      <section className={styles.section}>
        <div className={styles.notice}>"{params.number}" ISN'T A VALID PRESS NUMBER.</div>
      </section>
    );
  }

  if (lookup.status === "not-found") {
    return (
      <section className={styles.section}>
        <div className={styles.notice}>
          PRESS #{pressNumber.toLocaleString()} DOESN'T EXIST.
          {state.totalPresses > 0 && ` ONLY ${state.totalPresses.toLocaleString()} PRESSES HAVE HAPPENED SO FAR.`}
        </div>
      </section>
    );
  }

  if (lookup.status === "loading" || !lookup.event) {
    return (
      <section className={styles.section}>
        <div className={styles.notice}>SYNCING LOCAL HISTORY TO FIND PRESS #{pressNumber.toLocaleString()}…</div>
      </section>
    );
  }

  const event = lookup.event;
  const f = FACTIONS[event.faction] ?? FACTIONS[0];

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <span className={styles.eyebrow} style={{ color: f.color }}>
          PRESS #{event.pressNumber.toLocaleString()}
        </span>
        <h2>{f.seed}.</h2>
      </div>

      <div className={styles.layout}>
        <IdentityCard
          data={{
            pressNumber: event.pressNumber,
            remaining: event.remaining,
            faction: event.faction,
            presser: event.presser,
            isNewClosestCall: lookup.wasNewClosestCall
          }}
        />
        <div className={styles.facts}>
          <div>
            <span>WALLET</span>
            <code>
              <a href={addressUrl(runtimeConfig.network.explorer, event.presser)} target="_blank" rel="noopener noreferrer">
                {shortAddress(event.presser)} ↗
              </a>
            </code>
          </div>
          <div>
            <span>FACTION</span>
            <code style={{ color: f.color }}>{f.name}</code>
          </div>
          <div>
            <span>SECONDS REMAINING</span>
            <code>{event.remaining}s</code>
          </div>
          <div>
            <span>TIMESTAMP</span>
            <code>{new Date(event.timestamp * 1000).toLocaleString()}</code>
          </div>
          <div>
            <span>BLOCK</span>
            <code>{event.blockNumber.toLocaleString()}</code>
          </div>
          <div>
            <span>TRANSACTION</span>
            <code>
              <a href={txUrl(runtimeConfig.network.explorer, event.txHash)} target="_blank" rel="noopener noreferrer">
                VIEW ↗
              </a>
            </code>
          </div>
          <div>
            <span>NEW CLOSEST CALL?</span>
            <code>{lookup.wasNewClosestCall ? "YES" : "NO"}</code>
          </div>
        </div>
      </div>
    </section>
  );
}

import { useParams } from "react-router-dom";
import { FACTIONS } from "../domain/factions";
import { shortAddress } from "../domain/format";
import { runtimeConfig } from "../config/runtimeConfig";
import { useWalletPress } from "../hooks/useWalletPress";
import { usePageMeta } from "../lib/pageMeta";
import IdentityCard from "../components/identity/IdentityCard";
import styles from "./WalletPage.module.css";

export default function WalletPage() {
  const params = useParams<{ address: string }>();
  const address = (params.address ?? "").trim();
  const lookup = useWalletPress(address);
  const walletFaction = lookup.status === "ready" && lookup.hasPressed ? FACTIONS[lookup.faction] : null;

  usePageMeta(
    walletFaction
      ? {
          title: `${shortAddress(address)} — ${walletFaction.name}`,
          description: `${shortAddress(address)} pressed BUTTON at ${lookup.remaining} seconds. ${walletFaction.name}. One press forever.`
        }
      : null
  );

  if (runtimeConfig.previewMode) {
    return (
      <section className={styles.section}>
        <div className={styles.notice}>PREVIEW MODE HAS NO REAL WALLETS. CONFIGURE A CONTRACT TO LOOK ONE UP.</div>
      </section>
    );
  }

  if (lookup.status === "invalid-address") {
    return (
      <section className={styles.section}>
        <div className={styles.notice}>"{address}" ISN'T A VALID WALLET ADDRESS.</div>
      </section>
    );
  }

  if (lookup.status === "loading") {
    return (
      <section className={styles.section}>
        <div className={styles.notice}>READING {address}'S ONCHAIN STATUS…</div>
      </section>
    );
  }

  if (!lookup.hasPressed) {
    return (
      <section className={styles.section}>
        <div className={styles.head}>
          <span className={styles.eyebrow}>{address}</span>
          <h2>{FACTIONS[0].name} — {FACTIONS[0].seed}.</h2>
        </div>
        <div className={styles.notice}>THIS WALLET HAS NOT PRESSED. ITS ONE PRESS IS STILL UNSPENT.</div>
      </section>
    );
  }

  const f = FACTIONS[lookup.faction] ?? FACTIONS[0];

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <span className={styles.eyebrow} style={{ color: f.color }}>
          {address}
        </span>
        <h2>{f.seed}.</h2>
      </div>
      <IdentityCard
        data={{
          pressNumber: lookup.pressNumber,
          remaining: lookup.remaining,
          faction: lookup.faction,
          presser: address
        }}
      />
    </section>
  );
}

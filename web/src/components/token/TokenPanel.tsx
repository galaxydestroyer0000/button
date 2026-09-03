import { runtimeConfig } from "../../config/runtimeConfig";
import styles from "./TokenPanel.module.css";

export default function TokenPanel() {
  return (
    <section className={styles.section} id="lore">
      <div className={styles.copy}>
        <span className={styles.eyebrow}>BUTTON / RDDT</span>
        <h2>
          THE TOKEN IS THE RECEIPT.
          <br />
          THE BUTTON IS THE EXPERIMENT.
        </h2>
        <p>
          In 2015, Reddit gave the internet a 60-second timer and one irreversible press. More than a million people
          turned a button into factions, rituals and panic. BUTTON brings the same primitive onchain: one wallet,
          one press, one shared clock.
        </p>
        <p className={styles.disclaimer}>The token does not change your access, odds or result in the experiment.</p>
        {runtimeConfig.tokenUrl && (
          <a className={styles.link} href={runtimeConfig.tokenUrl} target="_blank" rel="noopener noreferrer">
            VIEW TOKEN ↗
          </a>
        )}
      </div>
      <div className={styles.art}>
        <img src="/assets/button-token.png" alt="BUTTON token artwork: a red button and countdown" />
      </div>
    </section>
  );
}

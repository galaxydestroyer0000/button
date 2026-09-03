import { runtimeConfig } from "../../config/runtimeConfig";
import { addressUrl } from "../../config/network";
import type { ExperimentState } from "../../domain/types";
import styles from "./ProofSection.module.css";

export default function ProofSection({ state }: { state: ExperimentState }) {
  return (
    <section className={styles.section} id="proof">
      <div className={styles.head}>
        <span className={styles.eyebrow}>PROOF</span>
        <h2>The UI can disappear. The rules remain.</h2>
      </div>
      <div className={styles.grid}>
        <div><span>NETWORK</span><code>{runtimeConfig.previewMode ? "PREVIEW / LOCAL" : runtimeConfig.network.name.toUpperCase()}</code></div>
        <div><span>CHAIN ID</span><code>{runtimeConfig.previewMode ? "—" : runtimeConfig.network.chainId}</code></div>
        <div><span>CONTRACT</span><code>{runtimeConfig.previewMode ? "NOT CONFIGURED" : runtimeConfig.contractAddress}</code></div>
        <div><span>DEPLOY BLOCK</span><code>{runtimeConfig.raw.contractDeployBlock || "—"}</code></div>
        <div><span>CURRENT BLOCK</span><code>{runtimeConfig.previewMode ? "—" : state.currentBlock || "—"}</code></div>
        <div><span>RPC</span><code>{runtimeConfig.previewMode ? "PREVIEW ONLY" : state.stale ? "STALE" : state.loaded ? "CONNECTED" : "CHECKING"}</code></div>
      </div>
      {!runtimeConfig.previewMode && (
        <a className={styles.link} href={addressUrl(runtimeConfig.network.explorer, runtimeConfig.contractAddress)} target="_blank" rel="noopener noreferrer">
          OPEN CONTRACT ON BLOCKSCOUT ↗
        </a>
      )}
    </section>
  );
}

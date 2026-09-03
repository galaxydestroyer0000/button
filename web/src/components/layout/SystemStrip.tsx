import styles from "./SystemStrip.module.css";
import { runtimeConfig } from "../../config/runtimeConfig";
import type { ExperimentState } from "../../domain/types";

export default function SystemStrip({ state }: { state: ExperimentState }) {
  const experimentStateLabel = runtimeConfig.previewMode
    ? "PREVIEW"
    : !state.loaded
      ? "LOADING"
      : !state.started
        ? "SEALED"
        : state.alive
          ? "LIVE"
          : "ENDED";

  return (
    <footer className={styles.strip}>
      <span>CHAIN <code>{runtimeConfig.previewMode ? "—" : runtimeConfig.network.name.toUpperCase()}</code></span>
      <span>DEPLOY BLOCK <code>{runtimeConfig.raw.contractDeployBlock || "—"}</code></span>
      <span>LATEST BLOCK <code>{runtimeConfig.previewMode ? "—" : state.currentBlock || "—"}</code></span>
      <span>UNIQUE PARTICIPANTS <code>{runtimeConfig.previewMode ? "—" : state.totalPresses.toLocaleString()}</code></span>
      <span>STATE <code>{experimentStateLabel}</code></span>
    </footer>
  );
}

import styles from "./SystemStrip.module.css";
import { useGameState } from "../../hooks/useGameState";

/** Footer strip on every page. Reads the database-backed game, which is what a
 *  visitor actually plays, not the operator's Robinhood Chain contract (that only
 *  /admin touches now). The token itself launches on Solana. */
export default function SystemStrip() {
  const state = useGameState();

  const stateLabel = !state.loaded ? "LOADING" : !state.started ? "SEALED" : state.alive ? "LIVE" : "ENDED";

  return (
    <footer className={styles.strip}>
      <span>TOKEN CHAIN <code>SOLANA</code></span>
      <span>UNIQUE PARTICIPANTS <code>{state.loaded ? state.totalPresses.toLocaleString() : "N/A"}</code></span>
      <span>STATE <code>{stateLabel}</code></span>
    </footer>
  );
}

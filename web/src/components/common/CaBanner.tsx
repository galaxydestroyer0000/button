import { useState } from "react";
import { useGameState } from "../../hooks/useGameState";
import styles from "./CaBanner.module.css";

/** Site-wide, sticky-top banner showing the $BUTTON token's contract address —
 *  deliberately the first thing on every page, not just the homepage, so a
 *  visitor checking a shared /wallet or /press link sees it too. The address
 *  itself is operator-set from /admin (see AdminPage.tsx's "Token contract"
 *  card and POST /api/admin's setTokenCA action) rather than a build-time env
 *  var, so it can go live the moment the token actually launches without a
 *  redeploy. Shown in full, never shortened — a visitor copy-pasting this to
 *  verify against a DEX/scanner needs the exact string, not a truncated one. */
export default function CaBanner() {
  const { tokenCA } = useGameState();
  const [copied, setCopied] = useState(false);

  if (!tokenCA) {
    return (
      <div className={`${styles.banner} ${styles.notLaunched}`}>
        <span className={styles.label}>CA</span>
        <span>NOT LAUNCHED</span>
      </div>
    );
  }

  async function copyCA() {
    try {
      await navigator.clipboard.writeText(tokenCA!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser — the address is still
      // fully visible and selectable by hand, so there's nothing to recover.
    }
  }

  return (
    <div className={styles.banner}>
      <span className={styles.label}>CA</span>
      <button type="button" className={styles.address} onClick={copyCA}>
        {tokenCA} · {copied ? "COPIED" : "COPY"}
      </button>
    </div>
  );
}

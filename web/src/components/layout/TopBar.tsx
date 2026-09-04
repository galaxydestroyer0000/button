import { useAccount, useConnect, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors";
import { shortAddress } from "../../domain/format";
import { runtimeConfig } from "../../config/runtimeConfig";
import { isSoundEnabled, playTone, setSoundEnabled } from "../../audio/tick";
import { useState } from "react";
import styles from "./TopBar.module.css";

export default function TopBar() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: connecting, error: connectError } = useConnect();
  const { switchChain, error: switchError } = useSwitchChain();
  const [soundOn, setSoundOn] = useState(isSoundEnabled());

  const walletLabel = runtimeConfig.previewMode
    ? "PREVIEW MODE"
    : isConnected && address
      ? shortAddress(address)
      : connecting
        ? "CONNECTING…"
        : "CONNECT WALLET";

  const networkLabel = `ROBINHOOD · ${runtimeConfig.previewMode ? "PREVIEW" : runtimeConfig.network.short}`;
  const wrongNetwork = !runtimeConfig.previewMode && isConnected && chainId !== runtimeConfig.network.chainId;

  function toggleSound() {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
    if (next) playTone(640, 0.045, 0.02);
  }

  function handleWalletClick() {
    if (runtimeConfig.previewMode || isConnected) return;
    connect({ connector: injected() });
  }

  function handleNetworkClick() {
    if (runtimeConfig.previewMode || !wrongNetwork) return;
    switchChain({ chainId: runtimeConfig.network.chainId });
  }

  const rejected =
    connectError &&
    ((connectError as unknown as { cause?: { code?: number } })?.cause?.code === 4001 ||
      (connectError as unknown as { code?: number })?.code === 4001 ||
      connectError.name === "UserRejectedRequestError");

  const connectionMessage = rejected
    ? "CONNECTION REJECTED · NOTHING CHANGED"
    : connectError && connectors.length === 0
      ? "NO INJECTED EVM WALLET · OPEN IN ROBINHOOD WALLET OR METAMASK BROWSER"
      : connectError
        ? `WALLET ERROR · ${connectError.message}`
        : "";

  const switchMessage = switchError ? `NETWORK SWITCH FAILED · ${switchError.message}` : "";

  const walletErrorMessage = connectionMessage || switchMessage;

  return (
    <>
      <header className={styles.topbar}>
        <a className={styles.brand} href="./">
          <span className={styles.brandDot} />
          BUTTON <span>/ RDDT</span>
        </a>
        <nav className={styles.nav}>
          <a href="#experiment">Experiment</a>
          <a href="#lore">Lore</a>
          <a href="#stats">Stats</a>
        </nav>
        <div className={styles.actions}>
          <button type="button" className={styles.soundBtn} aria-pressed={soundOn} onClick={toggleSound}>
            {soundOn ? "SOUND ON" : "SOUND OFF"}
          </button>
          <button
            type="button"
            className={styles.networkPill}
            onClick={handleNetworkClick}
            style={wrongNetwork ? { color: "#f4d03f", borderColor: "#f4d03f" } : undefined}
          >
            {wrongNetwork ? "WRONG NETWORK · SWITCH" : networkLabel}
          </button>
          <button type="button" className={styles.walletBtn} onClick={handleWalletClick} disabled={connecting}>
            {walletLabel}
          </button>
        </div>
      </header>
      {walletErrorMessage && (
        <div className={styles.walletError} role="alert">
          {walletErrorMessage}
        </div>
      )}
    </>
  );
}

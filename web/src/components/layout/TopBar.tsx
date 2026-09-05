import { useAccount, useConnect, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors";
import { NavLink, useLocation } from "react-router-dom";
import { shortAddress } from "../../domain/format";
import { runtimeConfig } from "../../config/runtimeConfig";
import { isSoundEnabled, playTone, setSoundEnabled } from "../../audio/tick";
import { useRef, useState } from "react";
import styles from "./TopBar.module.css";

export default function TopBar() {
  // Wallet connection only means anything on /admin now — regular visitors
  // never touch a wallet (see the /admin-only-onchain pivot in SECURITY.md),
  // so showing "CONNECT WALLET" everywhere else was actively misleading
  // about what pressing the button actually requires.
  const isAdminRoute = useLocation().pathname.startsWith("/admin");
  const { address, isConnected, chainId } = useAccount();
  const { connect, isPending: connecting, error: connectError } = useConnect();
  const { switchChain, error: switchError } = useSwitchChain();
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  // wagmi's WagmiProvider auto-attempts a silent reconnect on mount using the same
  // connect mutation this hook reads — a stale "previously connected" record with no
  // wallet actually available (a fresh mobile Safari tab, a wallet extension that got
  // uninstalled, etc.) surfaces through `connectError` exactly like a real failed
  // click would, even though the visitor never touched the button. Only a click
  // routed through handleWalletClick should ever produce the visible error banner.
  const userInitiatedConnectRef = useRef(false);

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
    userInitiatedConnectRef.current = true;
    connect({ connector: injected() });
  }

  function handleNetworkClick() {
    if (runtimeConfig.previewMode || !wrongNetwork) return;
    switchChain({ chainId: runtimeConfig.network.chainId });
  }

  const rejected =
    connectError &&
    userInitiatedConnectRef.current &&
    ((connectError as unknown as { cause?: { code?: number } })?.cause?.code === 4001 ||
      (connectError as unknown as { code?: number })?.code === 4001 ||
      connectError.name === "UserRejectedRequestError");

  // wagmi's injected() connector is always registered in wagmiConfig regardless of
  // whether window.ethereum actually exists at runtime — `connectors.length` is a
  // static build-time count, never 0 in this app, so it can never distinguish "no
  // wallet extension available" from any other failure. The connector throws a
  // specifically-named ProviderNotFoundError in that case; match on that instead.
  const noProvider = (connectError as unknown as { name?: string } | undefined)?.name === "ProviderNotFoundError";

  const connectionMessage = !userInitiatedConnectRef.current
    ? ""
    : rejected
      ? "CONNECTION REJECTED · NOTHING CHANGED"
      : noProvider
        ? "NO INJECTED EVM WALLET · OPEN IN ROBINHOOD WALLET OR METAMASK BROWSER"
        : connectError
          ? `WALLET ERROR · ${connectError.message}`
          : "";

  // A wallet that doesn't already have this chain registered falls back to
  // `wallet_addEthereumChain`, and most wallets (MetaMask included) flat-out refuse
  // to auto-add a chain whose RPC URL isn't HTTPS — real for Robinhood Chain
  // testnet/mainnet (always HTTPS) but always true for a local RPC like
  // http://127.0.0.1:8545. The wallet reports this as a generic "user rejected"
  // error with the real reason folded into the message text, so it must be
  // detected there rather than trusted at face value — otherwise a wallet-level
  // validation failure the user never even saw a prompt for gets mislabeled as
  // something they personally cancelled.
  const httpsRpcRejected = Boolean(switchError && /https/i.test(switchError.message));

  const switchRejected =
    !httpsRpcRejected &&
    switchError &&
    ((switchError as unknown as { cause?: { code?: number } })?.cause?.code === 4001 ||
      (switchError as unknown as { code?: number })?.code === 4001 ||
      switchError.name === "UserRejectedRequestError");

  const switchMessage = httpsRpcRejected
    ? `YOUR WALLET CAN'T AUTO-ADD ${runtimeConfig.network.name.toUpperCase()} (ITS RPC ISN'T HTTPS) · ADD CHAIN ${runtimeConfig.network.chainId} AT ${runtimeConfig.rpcUrl} MANUALLY IN YOUR WALLET, THEN SWITCH TO IT THERE`
    : switchRejected
      ? "NETWORK SWITCH CANCELLED · NOTHING CHANGED"
      : switchError
        ? `NETWORK SWITCH FAILED · ${switchError.message}`
        : "";

  const walletErrorMessage = connectionMessage || switchMessage;

  return (
    <>
      <header className={styles.topbar}>
        <NavLink className={styles.brand} to="/">
          <span className={styles.brandDot} />
          BUTTON <span>/ RDDT</span>
        </NavLink>
        <nav className={styles.nav}>
          <NavLink to="/" end>
            Experiment
          </NavLink>
          <NavLink to="/history">History</NavLink>
          <NavLink to="/stats">Stats</NavLink>
        </nav>
        <div className={styles.actions}>
          <button type="button" className={styles.soundBtn} aria-pressed={soundOn} onClick={toggleSound}>
            {soundOn ? "SOUND ON" : "SOUND OFF"}
          </button>
          {isAdminRoute && (
            <>
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
            </>
          )}
        </div>
      </header>
      {isAdminRoute && walletErrorMessage && (
        <div className={styles.walletError} role="alert">
          {walletErrorMessage}
        </div>
      )}
    </>
  );
}

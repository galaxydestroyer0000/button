/// <reference types="vite/client" />

interface ButtonConfig {
  network: "testnet" | "mainnet" | "local" | string;
  contractAddress: string;
  contractDeployBlock: string;
  tokenAddress: string;
  tokenUrl: string;
  pairLabel: string;
  /**
   * Optional RPC override for the active network (e.g. an Alchemy endpoint with an
   * API key) — the public rpc.*.chain.robinhood.com endpoints are rate-limited and
   * not recommended for production per Robinhood Chain's own docs. Falls back to the
   * public endpoint when unset. Any value here is baked into a public, client-loaded
   * script, so a provider API key embedded in it is inherently visible in the
   * browser's network requests — restrict it by allowed origin on the provider's
   * dashboard, don't rely on it being hidden.
   */
  rpcUrl: string;
  /** The deployment transaction hash, recorded by the operator after a real
   *  deployment (see scripts/deploy.sh's output / contracts/broadcast/). Optional,
   *  currently unused by any page — kept for parity with VITE_DEPLOY_TX/
   *  scripts/configure.mjs until something reads it again. */
  deployTx: string;
  /** The activation (`start()`) transaction hash, recorded by the operator after
   *  running scripts/start.sh. Optional, same status as deployTx. */
  startTx: string;
}

interface Window {
  BUTTON_CONFIG?: ButtonConfig;
}

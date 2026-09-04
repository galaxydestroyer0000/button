import { NETWORKS, type NetworkConfig, type NetworkKey } from "./network";

export interface RuntimeConfig {
  raw: ButtonConfig;
  network: NetworkConfig;
  contractAddress: `0x${string}` | "";
  previewMode: boolean;
  deployBlock: bigint | null;
  tokenUrl: string;
  tokenAddress: `0x${string}` | "";
  /** RPC URL to actually use for the active network — the configured override
   *  when set, otherwise the network's public default. */
  rpcUrl: string;
}

export const DEFAULT_RAW_CONFIG: ButtonConfig = {
  network: "testnet",
  contractAddress: "",
  contractDeployBlock: "",
  tokenAddress: "",
  tokenUrl: "",
  pairLabel: "BUTTON / RDDT",
  rpcUrl: "",
  deployTx: "",
  startTx: ""
};

/** A malformed deploy-block string (typo'd env var, stray whitespace, non-numeric
 *  value) must never crash the whole app at import time — `BigInt(...)` throws
 *  synchronously on invalid input, and this module's export runs before React ever
 *  mounts. Falling back to null just means the event backfill starts from block 0
 *  instead of the real deploy block — slower, never wrong. */
function parseDeployBlock(value: string): bigint | null {
  const trimmed = String(value || "").trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;
  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
}

/** Pure config-shaping logic, factored out of the `window.BUTTON_CONFIG` read (in
 *  runtimeConfig.ts) so it can be unit tested directly against arbitrary (including
 *  hostile/malformed) input without a DOM — importing this module never touches
 *  `window`, unlike runtimeConfig.ts's module-level singleton. */
export function computeRuntimeConfig(raw: ButtonConfig = DEFAULT_RAW_CONFIG): RuntimeConfig {
  const network = NETWORKS[raw.network as NetworkKey] || NETWORKS.testnet;
  const contract = String(raw.contractAddress || "").trim();
  const liveConfigured = /^0x[a-fA-F0-9]{40}$/.test(contract) && !/^0x0{40}$/i.test(contract);
  const token = String(raw.tokenAddress || "").trim();
  const tokenConfigured = /^0x[a-fA-F0-9]{40}$/.test(token) && !/^0x0{40}$/i.test(token);
  return {
    raw,
    network,
    contractAddress: liveConfigured ? (contract as `0x${string}`) : "",
    previewMode: !liveConfigured,
    deployBlock: parseDeployBlock(raw.contractDeployBlock),
    tokenUrl: raw.tokenUrl || "",
    tokenAddress: tokenConfigured ? (token as `0x${string}`) : "",
    rpcUrl: String(raw.rpcUrl || "").trim() || network.rpc
  };
}

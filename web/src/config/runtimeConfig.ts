import { NETWORKS, type NetworkConfig } from "./network";

export interface RuntimeConfig {
  raw: ButtonConfig;
  network: NetworkConfig;
  contractAddress: `0x${string}` | "";
  previewMode: boolean;
  deployBlock: bigint | null;
  tokenUrl: string;
}

function computeRuntimeConfig(): RuntimeConfig {
  const raw = window.BUTTON_CONFIG || {
    network: "testnet",
    contractAddress: "",
    contractDeployBlock: "",
    tokenAddress: "",
    tokenUrl: "",
    pairLabel: "BUTTON / RDDT"
  };
  const network = NETWORKS[raw.network as "mainnet" | "testnet"] || NETWORKS.testnet;
  const contract = String(raw.contractAddress || "").trim();
  const liveConfigured = /^0x[a-fA-F0-9]{40}$/.test(contract) && !/^0x0{40}$/i.test(contract);
  return {
    raw,
    network,
    contractAddress: liveConfigured ? (contract as `0x${string}`) : "",
    previewMode: !liveConfigured,
    deployBlock: raw.contractDeployBlock ? BigInt(raw.contractDeployBlock) : null,
    tokenUrl: raw.tokenUrl || ""
  };
}

export const runtimeConfig: RuntimeConfig = computeRuntimeConfig();

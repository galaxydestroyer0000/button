import { defineChain } from "viem";

export type NetworkKey = "mainnet" | "testnet" | "local";

export interface NetworkConfig {
  key: NetworkKey;
  name: string;
  short: string;
  chainId: number;
  rpc: string;
  explorer: string;
  chain: ReturnType<typeof defineChain>;
}

const mainnetChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } }
});

const testnetChain = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" } }
});

// Anvil's fixed chain ID and default RPC port. Only ever used by `scripts/demo.sh`
// against a real local `anvil` node with a real deployed contract — never a stand-in
// for testnet/mainnet, and never reachable unless VITE_RH_NETWORK=local is set.
const localChain = defineChain({
  id: 31337,
  name: "Local Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  blockExplorers: { default: { name: "None", url: "" } }
});

export const NETWORKS: Record<NetworkKey, NetworkConfig> = {
  mainnet: {
    key: "mainnet",
    name: "Robinhood Chain",
    short: "MAINNET",
    chainId: 4663,
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com",
    chain: mainnetChain
  },
  testnet: {
    key: "testnet",
    name: "Robinhood Chain Testnet",
    short: "TESTNET",
    chainId: 46630,
    rpc: "https://rpc.testnet.chain.robinhood.com",
    explorer: "https://explorer.testnet.chain.robinhood.com",
    chain: testnetChain
  },
  local: {
    key: "local",
    name: "Local Anvil",
    short: "LOCAL",
    chainId: 31337,
    rpc: "http://127.0.0.1:8545",
    explorer: "",
    chain: localChain
  }
};

// The local network has no block explorer — returning "#" instead of concatenating
// an empty base (which would silently point at this app's own origin, e.g. "/tx/0x…")
// keeps every explorer-link call site safe without touching each one individually.
export function txUrl(explorer: string, hash: string): string {
  return explorer ? `${explorer}/tx/${hash}` : "#";
}

export function addressUrl(explorer: string, addr: string): string {
  return explorer ? `${explorer}/address/${addr}` : "#";
}

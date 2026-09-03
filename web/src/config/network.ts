import { defineChain } from "viem";

export interface NetworkConfig {
  key: "mainnet" | "testnet";
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

export const NETWORKS: Record<"mainnet" | "testnet", NetworkConfig> = {
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
  }
};

export function txUrl(explorer: string, hash: string): string {
  return `${explorer}/tx/${hash}`;
}

export function addressUrl(explorer: string, addr: string): string {
  return `${explorer}/address/${addr}`;
}

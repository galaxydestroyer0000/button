/// <reference types="vite/client" />

interface ButtonConfig {
  network: "testnet" | "mainnet" | string;
  contractAddress: string;
  contractDeployBlock: string;
  tokenAddress: string;
  tokenUrl: string;
  pairLabel: string;
}

interface Window {
  BUTTON_CONFIG?: ButtonConfig;
}

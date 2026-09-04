import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { NETWORKS } from "./network";
import { runtimeConfig } from "./runtimeConfig";

// Only the site's configured active network ever gets the RPC override (e.g. an
// Alchemy endpoint) — the other networks keep their public/local default, since we
// never intentionally operate against them.
const testnetRpc = runtimeConfig.network.key === "testnet" ? runtimeConfig.rpcUrl : NETWORKS.testnet.rpc;
const mainnetRpc = runtimeConfig.network.key === "mainnet" ? runtimeConfig.rpcUrl : NETWORKS.mainnet.rpc;
const localRpc = runtimeConfig.network.key === "local" ? runtimeConfig.rpcUrl : NETWORKS.local.rpc;

export const wagmiConfig = createConfig({
  chains: [NETWORKS.testnet.chain, NETWORKS.mainnet.chain, NETWORKS.local.chain],
  connectors: [injected()],
  transports: {
    [NETWORKS.testnet.chain.id]: http(testnetRpc),
    [NETWORKS.mainnet.chain.id]: http(mainnetRpc),
    [NETWORKS.local.chain.id]: http(localRpc)
  }
});

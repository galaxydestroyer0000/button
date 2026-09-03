import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { NETWORKS } from "./network";

export const wagmiConfig = createConfig({
  chains: [NETWORKS.testnet.chain, NETWORKS.mainnet.chain],
  connectors: [injected()],
  transports: {
    [NETWORKS.testnet.chain.id]: http(NETWORKS.testnet.rpc),
    [NETWORKS.mainnet.chain.id]: http(NETWORKS.mainnet.rpc)
  }
});

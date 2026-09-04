import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const q = (v) => JSON.stringify(v ?? "");
const config = `window.BUTTON_CONFIG = {
  network: ${q(process.env.VITE_RH_NETWORK || "testnet")},
  contractAddress: ${q(process.env.VITE_BUTTON_CONTRACT || "")},
  contractDeployBlock: ${q(process.env.VITE_CONTRACT_DEPLOY_BLOCK || "")},
  tokenAddress: ${q(process.env.VITE_BUTTON_TOKEN || "")},
  tokenUrl: ${q(process.env.VITE_TOKEN_URL || "")},
  pairLabel: ${q(process.env.VITE_PAIR_LABEL || "BUTTON / RDDT")},
  rpcUrl: ${q(process.env.VITE_RH_RPC_URL || "")},
  deployTx: ${q(process.env.VITE_DEPLOY_TX || "")},
  startTx: ${q(process.env.VITE_START_TX || "")}
};\n`;
fs.writeFileSync(path.join(root, "web", "public", "config.js"), config);
console.log("Wrote web/public/config.js");

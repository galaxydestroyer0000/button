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
  pairLabel: ${q(process.env.VITE_PAIR_LABEL || "BUTTON / RDDT")}
};\n`;
fs.writeFileSync(path.join(root, "web", "config.js"), config);
console.log("Wrote web/config.js");

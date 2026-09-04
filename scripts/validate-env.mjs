#!/usr/bin/env node
// Refuses to proceed (build or deploy) if critical environment variables are
// missing, malformed, or set to values that would silently ship a broken or
// mock-looking production site. Run before a production frontend build and
// before any deploy/start action. Exit code 0 = safe to proceed; non-zero = stop.
import process from "node:process";

const mode = process.argv[2];
if (!["frontend", "deploy", "start"].includes(mode)) {
  console.error("Usage: node scripts/validate-env.mjs <frontend|deploy|start>");
  process.exit(2);
}

const errors = [];
const warnings = [];

function requireVar(name, { pattern, patternHint } = {}) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    errors.push(`${name} is required and not set.`);
    return null;
  }
  if (pattern && !pattern.test(value.trim())) {
    errors.push(`${name} is set but malformed${patternHint ? ` (expected ${patternHint})` : ""}: "${value}"`);
    return null;
  }
  return value.trim();
}

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS = /^0x0{40}$/i;
const NETWORKS = { frontend: ["testnet", "mainnet"] };

if (mode === "frontend") {
  const network = requireVar("VITE_RH_NETWORK", { pattern: /^(testnet|mainnet)$/, patternHint: '"testnet" or "mainnet" — never "local" for a production build' });
  const contract = requireVar("VITE_BUTTON_CONTRACT", { pattern: ADDRESS, patternHint: "a 0x-prefixed 20-byte address" });
  if (contract && ZERO_ADDRESS.test(contract)) {
    errors.push("VITE_BUTTON_CONTRACT is the zero address — this would silently build the site in PREVIEW MODE instead of pointing at a real deployment.");
  }
  const deployBlock = requireVar("VITE_CONTRACT_DEPLOY_BLOCK", { pattern: /^\d+$/, patternHint: "a positive integer block number" });
  if (deployBlock === "0") warnings.push("VITE_CONTRACT_DEPLOY_BLOCK is 0 — event backfill will scan from genesis, which is slow but not incorrect.");
  requireVar("VITE_PAIR_LABEL");

  const token = process.env.VITE_BUTTON_TOKEN;
  if (!token || !token.trim()) {
    warnings.push("VITE_BUTTON_TOKEN is not set — the token panel will show NOT CONFIGURED. Confirm this is intentional before launch.");
  } else if (!ADDRESS.test(token.trim())) {
    errors.push(`VITE_BUTTON_TOKEN is set but malformed: "${token}"`);
  }
  if (!process.env.VITE_TOKEN_URL || !process.env.VITE_TOKEN_URL.trim()) {
    warnings.push("VITE_TOKEN_URL is not set — the token panel will have no outbound link. Confirm this is intentional before launch.");
  }
  const TX_HASH = /^0x[a-fA-F0-9]{64}$/;
  for (const name of ["VITE_DEPLOY_TX", "VITE_START_TX"]) {
    const value = process.env[name];
    if (!value || !value.trim()) {
      warnings.push(`${name} is not set — the /proof page will show "not yet recorded" for it.`);
    } else if (!TX_HASH.test(value.trim())) {
      errors.push(`${name} is set but malformed: "${value}"`);
    }
  }
  if (network && NETWORKS.frontend.includes(network) && !process.env.VITE_RH_RPC_URL) {
    warnings.push(`VITE_RH_RPC_URL is not set — falling back to the public rpc.${network}.chain.robinhood.com endpoint, which Robinhood Chain's own docs say is rate-limited and not recommended for production.`);
  }
} else if (mode === "deploy") {
  requireVar("PRIVATE_KEY", { pattern: /^0x[a-fA-F0-9]{64}$/, patternHint: "a 0x-prefixed 32-byte private key" });
} else if (mode === "start") {
  requireVar("PRIVATE_KEY", { pattern: /^0x[a-fA-F0-9]{64}$/, patternHint: "a 0x-prefixed 32-byte private key" });
  requireVar("BUTTON_CONTRACT", { pattern: ADDRESS, patternHint: "a 0x-prefixed 20-byte address" });
}

for (const w of warnings) console.warn(`WARNING: ${w}`);

if (errors.length > 0) {
  console.error(`\nEnvironment validation FAILED for mode "${mode}" — ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error("\nRefusing to proceed.");
  process.exit(1);
}

console.log(`Environment validation passed for mode "${mode}"${warnings.length ? ` (${warnings.length} warning(s) above)` : ""}.`);

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_PATH = path.resolve(__dirname, "../../../contracts/out/ButtonExperiment.sol/ButtonExperiment.json");

// Anvil's default deterministic accounts (mnemonic "test test test ... junk").
// Publicly known, local-chain-only test keys — never used with real funds.
export const ANVIL_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"
] as const satisfies readonly Hex[];

export interface DeployedChain {
  rpcUrl: string;
  chainId: number;
  contractAddress: `0x${string}`;
  deployBlock: number;
  starterKey: Hex;
  /** The anvil process's own pid (not the detached process group leader's negative
   *  form) — exposed so it can be persisted to disk and killed from a different
   *  process later (Playwright's globalTeardown does not share memory with
   *  globalSetup across a full `playwright test` invocation). */
  anvilPid: number;
  stop(): void;
}

/** Boots a real anvil node on `port`, deploys the exact ButtonExperiment bytecode
 *  forge built (read from contracts/out — never a hand-rolled stand-in), and calls
 *  start(). Every step is a genuine JSON-RPC transaction against that node — used
 *  by both the Playwright global setup (app-driven E2E) and could equally back a
 *  script; there is exactly one deploy path this repo trusts for "real chain". */
export async function deployLocalChain(port: number): Promise<DeployedChain> {
  const rpcUrl = `http://127.0.0.1:${port}`;
  const chainId = 31337;

  const anvil = spawn("anvil", ["--port", String(port), "--chain-id", String(chainId)], {
    stdio: "ignore",
    detached: true
  });
  anvil.unref();

  await waitForRpc(rpcUrl);

  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf-8"));
  const abi = artifact.abi;
  const bytecode = artifact.bytecode.object as Hex;

  const starterAccount = privateKeyToAccount(ANVIL_KEYS[0]);
  const chain = { id: chainId, name: "e2e-anvil", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } };
  const walletClient = createWalletClient({ account: starterAccount, chain, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  const deployHash = await walletClient.deployContract({ abi, bytecode, args: [starterAccount.address] });
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  const contractAddress = deployReceipt.contractAddress;
  if (!contractAddress) throw new Error("Deployment did not produce a contract address");

  const startHash = await walletClient.writeContract({ address: contractAddress, abi, functionName: "start", args: [] });
  await publicClient.waitForTransactionReceipt({ hash: startHash });

  return {
    rpcUrl,
    chainId,
    contractAddress,
    deployBlock: Number(deployReceipt.blockNumber),
    starterKey: ANVIL_KEYS[0],
    anvilPid: anvil.pid!,
    stop() {
      try {
        process.kill(-anvil.pid!);
      } catch {
        try {
          anvil.kill();
        } catch {
          // already gone
        }
      }
    }
  };
}

async function waitForRpc(rpcUrl: string, attempts = 40): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] })
      });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`anvil at ${rpcUrl} never became reachable`);
}

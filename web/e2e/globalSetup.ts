import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deployLocalChain } from "./fixtures/chain";
import { writeE2EState } from "./support/state";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_JS_PATH = path.resolve(__dirname, "../public/config.js");
const E2E_PORT = 8646;

/** Runs once before the whole E2E suite: boots a real local chain, deploys and
 *  activates the exact contract in contracts/src, and points the app's
 *  public/config.js at it — the same file scripts/demo.sh writes, and the same one
 *  the app reads at runtime, so every spec exercises the real config-loading path
 *  rather than a test-only shortcut. The developer's own config.js (e.g. from a
 *  manually run demo.sh) is backed up and restored in globalTeardown. */
export default async function globalSetup(): Promise<void> {
  const previousConfigJs = existsSync(CONFIG_JS_PATH) ? readFileSync(CONFIG_JS_PATH, "utf-8") : null;

  const chain = await deployLocalChain(E2E_PORT);

  const configJs = `window.BUTTON_CONFIG = ${JSON.stringify({
    network: "local",
    contractAddress: chain.contractAddress,
    contractDeployBlock: String(chain.deployBlock),
    tokenAddress: "",
    tokenUrl: "",
    pairLabel: "BUTTON / RDDT",
    rpcUrl: chain.rpcUrl
  })};\n`;
  writeFileSync(CONFIG_JS_PATH, configJs, "utf-8");

  writeE2EState({
    rpcUrl: chain.rpcUrl,
    chainId: chain.chainId,
    contractAddress: chain.contractAddress,
    deployBlock: chain.deployBlock,
    anvilPid: chain.anvilPid,
    previousConfigJs
  });
}

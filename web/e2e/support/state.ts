import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const STATE_PATH = path.join(os.tmpdir(), "button-e2e-state.json");

export interface E2EState {
  rpcUrl: string;
  chainId: number;
  contractAddress: `0x${string}`;
  deployBlock: number;
  anvilPid: number;
  /** The exact bytes of web/public/config.js before global setup overwrote it, so
   *  teardown can restore whatever the developer had there (e.g. a live demo.sh
   *  deployment) instead of leaving the repo in a test-only state. `null` means the
   *  file did not exist before setup ran. */
  previousConfigJs: string | null;
}

export function writeE2EState(state: E2EState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state), "utf-8");
}

export function readE2EState(): E2EState {
  return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
}

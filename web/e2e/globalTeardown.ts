import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readE2EState } from "./support/state";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_JS_PATH = path.resolve(__dirname, "../public/config.js");

export default async function globalTeardown(): Promise<void> {
  const state = readE2EState();

  try {
    process.kill(-state.anvilPid);
  } catch {
    // already gone
  }

  if (state.previousConfigJs === null) {
    if (existsSync(CONFIG_JS_PATH)) rmSync(CONFIG_JS_PATH);
  } else {
    writeFileSync(CONFIG_JS_PATH, state.previousConfigJs, "utf-8");
  }
}

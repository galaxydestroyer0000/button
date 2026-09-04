import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ANVIL_KEYS } from "./fixtures/chain";
import { installInjectedWallet } from "./support/injectedWallet";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_PATH = path.resolve(__dirname, "../../contracts/out/ButtonExperiment.sol/ButtonExperiment.json");
const ADMIN_TEST_PORT = 8666;
const RPC_URL = `http://127.0.0.1:${ADMIN_TEST_PORT}`;
const CHAIN_ID = 31337;
const WINDOW_SECONDS = 60;

/**
 * The admin page's resetTimer()/start() require precise control over "is the
 * experiment alive right now" without waiting out a real 60-second window (slow)
 * or racing real wall-clock time against anvil's own quirk of freezing
 * block.timestamp until a new block is actually mined (flaky). `evm_increaseTime`
 * + `evm_mine` are real anvil JSON-RPC methods — this is still a real chain
 * responding to real requests, just with deterministic, fast time control instead
 * of `sleep`.
 */
async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params })
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

async function advanceTimeAndMine(seconds: number): Promise<void> {
  await rpc("evm_increaseTime", [seconds]);
  await rpc("evm_mine", []);
}

let anvilPid: number;
let contractAddress: `0x${string}`;
const starterAccount = privateKeyToAccount(ANVIL_KEYS[0]);

/** Deploys a fresh, SEALED ButtonExperiment on the shared admin-e2e anvil — used
 *  both for the describe block's main shared contract and for tests that need
 *  their own isolated one (e.g. the wrong-network test, which must start from
 *  SEALED regardless of what the shared contract's lifecycle has reached). */
async function deployFreshContract(): Promise<`0x${string}`> {
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf-8"));
  const chain = { id: CHAIN_ID, name: "admin-e2e", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } };
  const walletClient = createWalletClient({ account: starterAccount, chain, transport: http(RPC_URL) });
  const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

  const deployHash = await walletClient.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object as Hex, args: [starterAccount.address] });
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  return deployReceipt.contractAddress!;
}

test.beforeAll(async () => {
  const anvil = spawn("anvil", ["--port", String(ADMIN_TEST_PORT), "--chain-id", String(CHAIN_ID)], { stdio: "ignore", detached: true });
  anvil.unref();
  anvilPid = anvil.pid!;

  for (let i = 0; i < 40; i++) {
    try {
      await rpc("eth_blockNumber");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  // Deliberately deployed SEALED (not started) here — individual tests start it
  // themselves so each test controls its own timing precisely.
  contractAddress = await deployFreshContract();
});

test.afterAll(() => {
  try {
    process.kill(-anvilPid);
  } catch {
    // already gone
  }
});

/** Points this test's page at our own isolated chain, not the shared one
 *  globalSetup/globalTeardown own. Two things load a config, in this order:
 *  `addInitScript` runs before any page script, but `index.html` itself loads
 *  `/config.js` as a real `<script src="/config.js">` tag that unconditionally
 *  does `window.BUTTON_CONFIG = {...}` — so it runs SECOND and clobbers
 *  whatever addInitScript set. Routing the /config.js request itself removes
 *  the race entirely: whichever script runs last, both now agree. (Still never
 *  writes web/public/config.js on disk — that file stays globalSetup's alone.) */
async function useAdminTestConfig(page: import("@playwright/test").Page, address: `0x${string}` = contractAddress): Promise<void> {
  const cfg = {
    network: "local",
    contractAddress: address,
    contractDeployBlock: "1",
    tokenAddress: "",
    tokenUrl: "",
    pairLabel: "BUTTON / RDDT",
    rpcUrl: RPC_URL,
    deployTx: "",
    startTx: ""
  };
  await page.addInitScript((c) => {
    (window as unknown as { BUTTON_CONFIG: unknown }).BUTTON_CONFIG = c;
  }, cfg);
  await page.route("**/config.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: `window.BUTTON_CONFIG = ${JSON.stringify(cfg)};\n` })
  );
}

test.describe("admin page: start() and resetTimer()", () => {
  test("a non-starter wallet sees ACCESS DENIED and cannot submit either action", async ({ page }) => {
    await useAdminTestConfig(page);
    const outsider = privateKeyToAccount(ANVIL_KEYS[1]);
    await installInjectedWallet(page, { address: outsider.address, rpcUrl: RPC_URL, chainId: CHAIN_ID });
    await page.goto("/admin");
    await page.getByRole("button", { name: /connect wallet/i }).click();

    await expect(page.getByText("DENIED — WRONG WALLET")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "START THE EXPERIMENT" })).toBeDisabled();
  });

  test("a starter wallet on the wrong network gets switched first, never silently submitting on the wrong chain", async ({ page }) => {
    // Reproduces a real incident: a connected wallet's *active* chain is whatever
    // it last had selected, completely independent of which chain this page reads
    // from — writeContractAsync with no chain check sends wherever the wallet
    // currently is. On a wallet holding funds only on the target testnet but
    // sitting on some other chain, that showed up as "Insufficient ETH balance"
    // for a transaction the wallet had no intention of sending anywhere real. The
    // fix (mirroring PressStage's existing guard) is: switch first, submit second.
    const freshContract = await deployFreshContract();
    await useAdminTestConfig(page, freshContract);
    const SOME_OTHER_CHAIN_ID = 1;
    await installInjectedWallet(page, {
      address: starterAccount.address,
      rpcUrl: RPC_URL,
      chainId: CHAIN_ID,
      initialChainId: SOME_OTHER_CHAIN_ID,
      startUnregistered: false
    });
    await page.goto("/admin");
    await page.getByRole("button", { name: /connect wallet/i }).click();

    await expect(page.getByText("GRANTED")).toBeVisible({ timeout: 15_000 });
    const startButton = page.getByRole("button", { name: "START THE EXPERIMENT" });
    await expect(startButton).toBeEnabled({ timeout: 15_000 });
    await startButton.click();

    // First click only switches networks — no transaction should have been sent,
    // so the contract must still be exactly as sealed as it was before the click.
    await expect(page.getByText("SWITCHING TO LOCAL ANVIL…")).toBeVisible({ timeout: 15_000 });
    const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf-8"));
    const publicClient = createPublicClient({
      chain: { id: CHAIN_ID, name: "admin-e2e", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } },
      transport: http(RPC_URL)
    });
    expect(await publicClient.readContract({ address: freshContract, abi: artifact.abi, functionName: "started" })).toBe(false);

    // Second click, now on the right chain, actually activates it.
    await expect(startButton).toBeEnabled({ timeout: 15_000 });
    await startButton.click();
    await expect(page.getByText("ACTIVATED · THE CLOCK IS RUNNING")).toBeVisible({ timeout: 20_000 });
  });

  test("the starter wallet can activate the experiment", async ({ page }) => {
    await useAdminTestConfig(page);
    await installInjectedWallet(page, { address: starterAccount.address, rpcUrl: RPC_URL, chainId: CHAIN_ID });
    await page.goto("/admin");
    await page.getByRole("button", { name: /connect wallet/i }).click();

    await expect(page.getByText("GRANTED")).toBeVisible({ timeout: 15_000 });
    const startButton = page.getByRole("button", { name: "START THE EXPERIMENT" });
    await expect(startButton).toBeEnabled({ timeout: 15_000 });
    await startButton.click();

    await expect(page.getByText("ACTIVATED · THE CLOCK IS RUNNING")).toBeVisible({ timeout: 20_000 });
    // Scoped to the facts panel — the footer's own network-status strip also
    // renders the text "LIVE" for its own unrelated purpose.
    await expect(page.locator("[class*=facts]").getByText("LIVE", { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test("the starter wallet can reset the timer while the experiment is alive", async ({ page }) => {
    // This test's own contract was started in the previous test (shared across
    // this describe block's tests, same as production: one contract, one lifecycle).
    await useAdminTestConfig(page);
    await installInjectedWallet(page, { address: starterAccount.address, rpcUrl: RPC_URL, chainId: CHAIN_ID });
    await page.goto("/admin");
    await page.getByRole("button", { name: /connect wallet/i }).click();

    const resetButton = page.getByRole("button", { name: "RESET TIMER TO 60s" });
    await expect(resetButton).toBeEnabled({ timeout: 15_000 });
    await resetButton.click();

    await expect(page.getByText("TIMER RESET · DEADLINE PUSHED BACK TO A FRESH 60 SECONDS")).toBeVisible({ timeout: 20_000 });
  });

  test("resetTimer() rejected with the correct explanation when the deadline passes while the transaction is in flight, not a raw error or a hang", async ({ page }) => {
    // This test's contract is still alive here (test 3 just reset its deadline to
    // +60s) — the button is genuinely enabled, no DOM trickery needed. A forced
    // `el.disabled = false` doesn't work here anyway: React DOM's click handling
    // reads `disabled` off the fiber's last-rendered props, not the live DOM
    // property, so a click dispatched against a still-React-disabled button is
    // silently swallowed no matter what the DOM attribute says.
    //
    // Instead this reproduces the real failure mode directly: pause automining,
    // submit resetTimer() while genuinely alive (a real pending transaction), then
    // let the deadline pass and mine it — so it reverts for the same reason a
    // just-missed submission would in production, and the admin page has to
    // explain a *mined, reverted* transaction rather than a pre-flight guard.
    await useAdminTestConfig(page);
    await installInjectedWallet(page, { address: starterAccount.address, rpcUrl: RPC_URL, chainId: CHAIN_ID });
    await page.goto("/admin");
    await page.getByRole("button", { name: /connect wallet/i }).click();

    const resetButton = page.getByRole("button", { name: "RESET TIMER TO 60s" });
    await expect(resetButton).toBeEnabled({ timeout: 15_000 });

    await rpc("evm_setAutomine", [false]);
    await resetButton.click();
    await expect(page.getByText("SUBMITTED · WAITING FOR CHAIN CONFIRMATION…")).toBeVisible({ timeout: 15_000 });

    // Mines a block whose timestamp is past the deadline and includes the pending
    // resetTimer() tx in it — it reverts inside that block, the same as a
    // just-missed-the-window submission would for a real user.
    await advanceTimeAndMine(WINDOW_SECONDS + 5);
    await rpc("evm_setAutomine", [true]);

    await expect(page.getByText(/THE EXPERIMENT IS NOT CURRENTLY ALIVE/i)).toBeVisible({ timeout: 20_000 });
    // No dead end, no silent success claim:
    await expect(page.getByText("TIMER RESET · DEADLINE PUSHED BACK")).toHaveCount(0);
  });
});

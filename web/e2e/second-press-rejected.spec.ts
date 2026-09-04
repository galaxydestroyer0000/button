import { expect, test } from "@playwright/test";
import { createPublicClient, createWalletClient, http, toFunctionSelector } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buttonExperimentAbi } from "../src/abi/buttonExperiment";
import { ANVIL_KEYS } from "./fixtures/chain";
import { installInjectedWallet } from "./support/injectedWallet";
import { readE2EState } from "./support/state";

// A wallet distinct from the other spec files' accounts so specs never contend
// over the same "one press per wallet" state.
const PRESSER_KEY = ANVIL_KEYS[3];
const HAS_PRESSED_SELECTOR = toFunctionSelector("hasPressed(address)");

test("controlled failure: a wallet that already pressed elsewhere attempts to press again while its own status is still loading — the contract rejects it and the UI explains ONE PRESS FOREVER", async ({
  page
}) => {
  const chain = readE2EState();
  const account = privateKeyToAccount(PRESSER_KEY);
  const rpcChain = { id: chain.chainId, name: "e2e", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [chain.rpcUrl] } } };

  // This wallet already pressed once, entirely outside this browser session — the
  // same real-world shape as "pressed from a different device, now opens this one".
  const walletClient = createWalletClient({ account, chain: rpcChain, transport: http(chain.rpcUrl) });
  const publicClient = createPublicClient({ chain: rpcChain, transport: http(chain.rpcUrl) });
  const priorPressHash = await walletClient.writeContract({ address: chain.contractAddress, abi: buttonExperimentAbi, functionName: "press", args: [] });
  await publicClient.waitForTransactionReceipt({ hash: priorPressHash });
  expect(await publicClient.readContract({ address: chain.contractAddress, abi: buttonExperimentAbi, functionName: "hasPressed", args: [account.address] })).toBe(
    true
  );

  // Deliberately delay only this wallet's `hasPressed` read — simulating the exact
  // real race the frontend has to survive: a wallet whose *own* onchain status read
  // is lagging (RPC latency, a slow tab just resumed from background, etc.) opens
  // the app. `state.loaded` (the *shared* experiment state) is not delayed, so the
  // press button becomes enabled before this wallet's personal "already pressed"
  // fact has loaded — proving the contract, not merely the disabled attribute, is
  // what actually stops the second press.
  await page.route(chain.rpcUrl, async (route) => {
    const body = route.request().postDataJSON();
    const isHasPressedCall = body?.method === "eth_call" && typeof body?.params?.[0]?.data === "string" && body.params[0].data.startsWith(HAS_PRESSED_SELECTOR);
    if (isHasPressedCall) {
      await new Promise((r) => setTimeout(r, 8_000));
    }
    await route.continue();
  });

  await installInjectedWallet(page, { address: account.address, rpcUrl: chain.rpcUrl, chainId: chain.chainId });
  await page.goto("/");
  await page.getByRole("button", { name: /connect wallet/i }).click();

  // The shared countdown loads immediately (not delayed); this wallet's own
  // "already pressed" status has not resolved yet, so the button is still enabled.
  const pressButton = page.getByRole("button", { name: "PRESS" });
  await expect(pressButton).toBeEnabled({ timeout: 10_000 });
  await pressButton.click();

  await expect(page.getByText(/press failed/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/your wallet had already pressed/i)).toBeVisible({ timeout: 20_000 });

  // No dead end: once the delayed personal read finally lands, the UI self-corrects
  // to the same permanent SPENT state every other session sees for this wallet.
  await expect(page.getByRole("button", { name: "SPENT" })).toBeVisible({ timeout: 10_000 });

  // Exactly one press happened for this wallet — the rejected attempt changed nothing.
  expect(await publicClient.readContract({ address: chain.contractAddress, abi: buttonExperimentAbi, functionName: "pressNumber", args: [account.address] })).toBeGreaterThan(
    0n
  );
});

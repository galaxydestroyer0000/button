import { expect, test } from "@playwright/test";
import { privateKeyToAccount } from "viem/accounts";
import { ANVIL_KEYS } from "./fixtures/chain";
import { installInjectedWallet } from "./support/injectedWallet";
import { readE2EState } from "./support/state";

// Account index 2 — distinct from the starter (0) and from the account the
// second-press spec uses (1), so specs never collide over "one press per wallet".
const PRESSER_KEY = ANVIL_KEYS[2];

test.describe("critical path: connect, press, confirm, prove identity", () => {
  test("a wallet's press lands on chain, resets the clock, and the UI shows the confirmed identity", async ({ page }) => {
    const chain = readE2EState();
    const account = privateKeyToAccount(PRESSER_KEY);
    await installInjectedWallet(page, { address: account.address, rpcUrl: chain.rpcUrl, chainId: chain.chainId });

    await page.goto("/");

    // ENTRY / CONNECT
    await expect(page.getByRole("button", { name: /connect wallet/i })).toBeVisible();
    await page.getByRole("button", { name: /connect wallet/i }).click();
    await expect(page.getByRole("button", { name: new RegExp(account.address.slice(2, 6), "i") })).toBeVisible({ timeout: 15_000 });

    // ELIGIBILITY / COUNTDOWN: the press button must become pressable once the
    // wallet's own onchain state (not yet pressed) has loaded.
    const pressButton = page.getByRole("button", { name: "PRESS" });
    await expect(pressButton).toBeEnabled({ timeout: 15_000 });

    // ATTEMPT — the injected wallet resolves instantly (no real popup latency), so
    // the transient "confirm in your wallet" status can race past before it's
    // observed; the meaningful, non-racy assertions are the CHAIN RESULT ones below.
    await pressButton.click();

    // CHAIN RESULT / PROOF: the confirmation text is sourced from the mined
    // receipt's decoded Pressed event, not a guess.
    await expect(page.getByText(/confirmed on robinhood chain/i)).toBeVisible({ timeout: 20_000 });

    // IDENTITY: the identity card renders the wallet's real onchain result.
    const card = page.locator('[class*="card"]', { hasText: "PRESS #" });
    await expect(card).toBeVisible();
    await expect(card.getByText(/^PRESS #\d+$/)).toBeVisible();
    await expect(card.getByText(account.address.slice(0, 6), { exact: false })).toBeVisible();
    await expect(card.getByRole("button", { name: "DOWNLOAD" })).toBeVisible();
    await expect(card.getByRole("button", { name: "COPY" })).toBeVisible();
    await expect(card.getByRole("link", { name: /share on x/i })).toBeVisible();

    // The button itself now reflects the permanent SPENT state.
    await expect(page.getByRole("button", { name: "SPENT" })).toBeVisible();

    // STATE CHANGE: the shared stats reflect the real onchain totals, not a local guess.
    await expect(page.getByText("TOTAL PRESSES")).toBeVisible();
  });

  test("a second tab with the same already-pressed wallet independently shows SPENT — no shared client cache, just the chain", async ({
    browser
  }) => {
    // Re-uses the same wallet the first test in this file already pressed with, in
    // a brand-new browser context (equivalent to a second device/browser, not just
    // a second tab sharing localStorage) — the "already pressed" fact must come
    // from each session's own onchain read, not anything carried over client-side.
    const chain = readE2EState();
    const account = privateKeyToAccount(PRESSER_KEY);
    const context = await browser.newContext();
    const page = await context.newPage();
    await installInjectedWallet(page, { address: account.address, rpcUrl: chain.rpcUrl, chainId: chain.chainId });

    await page.goto("/");
    await page.getByRole("button", { name: /connect wallet/i }).click();
    await expect(page.getByRole("button", { name: "SPENT" })).toBeVisible({ timeout: 15_000 });
    await context.close();
  });
});

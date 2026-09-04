import { expect, test } from "@playwright/test";
import { privateKeyToAccount } from "viem/accounts";
import { ANVIL_KEYS } from "./fixtures/chain";
import { installInjectedWallet } from "./support/injectedWallet";
import { readE2EState } from "./support/state";

// A wallet distinct from the other spec files' accounts — this file never presses,
// but keeping accounts non-overlapping avoids any accidental cross-spec coupling.
const WALLET_KEY = ANVIL_KEYS[4];
// A chain ID the mock wallet starts connected to that is NOT the app's target —
// simulates a real wallet sitting on some other network (e.g. Ethereum mainnet)
// when the visitor arrives.
const SOME_OTHER_CHAIN_ID = 1;

test.describe("network switch: wrong network → SWITCH button", () => {
  test("a wallet that already has the target network registered switches successfully", async ({ page }) => {
    const chain = readE2EState();
    const account = privateKeyToAccount(WALLET_KEY);
    await installInjectedWallet(page, {
      address: account.address,
      rpcUrl: chain.rpcUrl,
      chainId: chain.chainId,
      initialChainId: SOME_OTHER_CHAIN_ID,
      startUnregistered: false // the target chain is already known to the wallet
    });

    await page.goto("/");
    await page.getByRole("button", { name: /connect wallet/i }).click();

    const switchButton = page.getByRole("button", { name: /wrong network/i });
    await expect(switchButton).toBeVisible({ timeout: 15_000 });
    await switchButton.click();

    // A plain wallet_switchEthereumChain against an already-registered chain has no
    // HTTPS requirement — it must succeed, clearing the wrong-network state entirely.
    await expect(page.getByRole("button", { name: /wrong network/i })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText(/network switch failed|network switch cancelled|can't auto-add/i)).toHaveCount(0);
    expect(chain.chainId).toBe(31337); // sanity: this harness always deploys to local anvil
    await expect(page.getByRole("button", { name: "ROBINHOOD · LOCAL" })).toBeVisible();
  });

  test("a wallet with no rpcUrls that are HTTPS cannot auto-add the network, and the app explains why instead of showing a raw error", async ({
    page
  }) => {
    const chain = readE2EState();
    const account = privateKeyToAccount(WALLET_KEY);
    await installInjectedWallet(page, {
      address: account.address,
      rpcUrl: chain.rpcUrl,
      chainId: chain.chainId,
      initialChainId: SOME_OTHER_CHAIN_ID,
      startUnregistered: true // forces switch -> 4902 -> addEthereumChain -> HTTPS rejection
    });

    await page.goto("/");
    await page.getByRole("button", { name: /connect wallet/i }).click();

    const switchButton = page.getByRole("button", { name: /wrong network/i });
    await expect(switchButton).toBeVisible({ timeout: 15_000 });
    await switchButton.click();

    // The real wallet rejection (HTTPS-only rpcUrls for auto-add) must be decoded
    // into the specific, actionable message — not left as viem's raw error text —
    // and the app must NOT claim success or silently clear the wrong-network state.
    await expect(page.getByText(/can't auto-add/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/add chain/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /wrong network/i })).toBeVisible();
  });
});

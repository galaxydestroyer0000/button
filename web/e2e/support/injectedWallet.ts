import type { Page } from "@playwright/test";

/**
 * Installs a minimal EIP-1193 `window.ethereum` before any page script runs. It is
 * a thin fetch()-based proxy straight to the given anvil RPC — no client-side
 * signing logic, because anvil's own default accounts are already "unlocked": the
 * node signs eth_sendTransaction on their behalf, exactly like it does for `cast
 * send --private-key` in scripts/demo.sh. This is real transaction submission
 * against a real node, not a mock of wallet behavior.
 *
 * Network switching/adding, however, IS mocked here — deliberately faithfully to
 * real MetaMask behavior, not simplified to always-succeed, because that distinction
 * is exactly what a real hostile/edge-case bug lived in (see
 * e2e/network-switch.spec.ts): a wallet that doesn't already have a target chain
 * registered falls back to `wallet_addEthereumChain`, and real wallets reject that
 * call outright when the chain's rpcUrls aren't HTTPS — before the user ever sees a
 * prompt. `registeredChainIds` starts pre-loaded with `initialChainId` (or, if
 * `startUnregistered` is set, empty) so a test can choose which scenario to exercise.
 */
export async function installInjectedWallet(
  page: Page,
  params: {
    address: `0x${string}`;
    rpcUrl: string;
    chainId: number;
    /** If provided, the mock starts already connected to THIS chain instead of
     *  `chainId` — used to simulate a wallet sitting on the wrong network. */
    initialChainId?: number;
    /** If true, `chainId` (the app's target network) is NOT pre-registered in the
     *  mock wallet, forcing wallet_switchEthereumChain to fail with 4902 and fall
     *  back to wallet_addEthereumChain — the real shape of "first time connecting
     *  to this network." Defaults to false (chainId is already known/registered). */
    startUnregistered?: boolean;
  }
): Promise<void> {
  await page.addInitScript((p) => {
    const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
    let currentChainId = p.initialChainId ?? p.chainId;
    const registeredChainIds = new Set<number>([currentChainId]);
    if (!p.startUnregistered) registeredChainIds.add(p.chainId);

    async function rpc(method: string, params: unknown[]): Promise<unknown> {
      const res = await fetch(p.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params })
      });
      const body = await res.json();
      if (body.error) {
        const err = new Error(body.error.message || "RPC error") as Error & { code?: number; data?: unknown };
        err.code = body.error.code;
        err.data = body.error.data;
        throw err;
      }
      return body.result;
    }

    function walletError(code: number, message: string): Error & { code: number } {
      const err = new Error(message) as Error & { code: number };
      err.code = code;
      return err;
    }

    const provider = {
      isMetaMask: true,
      async request({ method, params: reqParams }: { method: string; params?: unknown[] }) {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [p.address];
        if (method === "eth_chainId") return `0x${currentChainId.toString(16)}`;
        if (method === "net_version") return String(currentChainId);

        if (method === "wallet_switchEthereumChain") {
          const [{ chainId: hexId }] = reqParams as [{ chainId: string }];
          const targetId = parseInt(hexId, 16);
          if (!registeredChainIds.has(targetId)) {
            // Real MetaMask code 4902: "Unrecognized chain ID" — wagmi's
            // switchChain catches exactly this and falls back to
            // wallet_addEthereumChain, which is what we want exercised here.
            throw walletError(4902, "Unrecognized chain ID");
          }
          currentChainId = targetId;
          return null;
        }

        if (method === "wallet_addEthereumChain") {
          const [chainParams] = reqParams as [{ chainId: string; rpcUrls?: string[] }];
          const rpcUrls = chainParams.rpcUrls ?? [];
          // The real, specific rejection this mock exists to reproduce: MetaMask
          // refuses to auto-add a chain whose RPC isn't HTTPS, and folds the real
          // reason into a nominally-"user rejected" (code 4001) error.
          if (!rpcUrls.some((url) => url.startsWith("https://"))) {
            throw walletError(
              4001,
              `User rejected the request. Details: Expected an array with at least one valid string HTTPS url 'rpcUrls', Received: ${rpcUrls[0] ?? ""}`
            );
          }
          const targetId = parseInt(chainParams.chainId, 16);
          registeredChainIds.add(targetId);
          currentChainId = targetId;
          return null;
        }

        if (method === "eth_sendTransaction") {
          const [tx] = reqParams as [Record<string, unknown>];
          return rpc("eth_sendTransaction", [{ ...tx, from: p.address }]);
        }
        return rpc(method, reqParams ?? []);
      },
      on(event: string, handler: (...args: unknown[]) => void) {
        (listeners[event] ??= []).push(handler);
      },
      removeListener(event: string, handler: (...args: unknown[]) => void) {
        listeners[event] = (listeners[event] ?? []).filter((h) => h !== handler);
      }
    };

    Object.defineProperty(window, "ethereum", { value: provider, configurable: true, writable: true });
  }, params);
}

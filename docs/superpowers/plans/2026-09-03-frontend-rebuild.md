# BUTTON Frontend Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `web/` from a single dependency-free vanilla JS file into a componentized React + TypeScript + Vite app, matching the industrial control-panel visual direction, while preserving every existing behavior byte-for-byte (states, polling cadence, timer precision, sound, chain-time correction, preview mode).

**Architecture:** React 18 function components, one CSS Module per component, viem for ABI-typed contract reads/event decoding, wagmi for wallet/account/chain state and writes, TanStack Query (`useQuery`) driving polling directly against a `viem` `publicClient` rather than wagmi's automatic multicall batching — the target chain is a brand-new custom L2 that may not have Multicall3 deployed at the canonical address, so this plan uses individual parallel `readContract` calls exactly like the original hand-rolled RPC layer did, avoiding that risk entirely.

**Tech Stack:** React 18, TypeScript 5 (strict), Vite 5, viem 2, wagmi 2, @tanstack/react-query 5, ESLint 9 (flat config) + typescript-eslint.

## Global Constraints

- `window.BUTTON_CONFIG` (written by `scripts/configure.mjs`, unchanged) is read at **runtime**, never via `import.meta.env`. Preview mode = no valid `contractAddress`.
- `scripts/deploy.sh`, `scripts/start.sh`, `contracts/`, and the Solidity contract are never modified.
- No automated test suite is added (per the approved design spec, section 2/11) — every task's verification step is `tsc --noEmit` / `eslint` / `vite build`, and the final task adds a manual browser smoke test.
- No Tailwind, no component library, no gradients/glassmorphism. CSS Modules only, consuming global tokens ported verbatim from `web/styles.css`.
- Faction bands: PURPLE 52–60s, BLUE 42–51s, GREEN 32–41s, YELLOW 22–31s, ORANGE 12–21s, RED 0–11s, GREY = never pressed.
- Countdown urgency thresholds: `urgent` at ≤12s remaining, `critical` at ≤5s remaining — exact thresholds from `web/app.js`'s `updateTimer`.
- Core state polls every 2500ms, press feed polls every 5000ms — exact cadence from `web/app.js`'s `boot()`.
- The design spec is at `docs/superpowers/specs/2026-09-03-frontend-rebuild-design.md` — consult it for anything this plan doesn't spell out.

---

## Task 1: Project scaffold

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/tsconfig.node.json`
- Create: `web/vite.config.ts`
- Create: `web/eslint.config.js`
- Create: `web/index.html` (replaces the current static `web/index.html`)
- Create: `web/public/config.js` (replaces the current `web/config.js`; empty = preview mode, identical shape to today)
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/vite-env.d.ts`

**Interfaces:**
- Produces: `App` component (default export from `web/src/App.tsx`) that later tasks compose into; `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck` scripts that every later task's verification step relies on.

- [ ] **Step 1: Write `web/package.json`**

```json
{
  "name": "button-web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.59.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "viem": "^2.21.0",
    "wagmi": "^2.12.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.11.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "eslint": "^9.11.0",
    "eslint-plugin-react-hooks": "^5.1.0",
    "eslint-plugin-react-refresh": "^0.4.0",
    "typescript": "^5.6.0",
    "typescript-eslint": "^8.7.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Write `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Write `web/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Write `web/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 4173 },
  preview: { port: 4173 }
});
```

- [ ] **Step 5: Write `web/eslint.config.js`**

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    }
  }
);
```

- [ ] **Step 6: Write `web/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#080808" />
  <meta name="description" content="BUTTON — one wallet, one press, one shared clock on Robinhood Chain." />
  <title>BUTTON / RDDT — One press forever</title>
  <script src="/config.js"></script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 7: Write `web/public/config.js`**

```js
window.BUTTON_CONFIG = {
  network: "testnet",
  contractAddress: "",
  contractDeployBlock: "",
  tokenAddress: "",
  tokenUrl: "",
  pairLabel: "BUTTON / RDDT"
};
```

- [ ] **Step 8: Write `web/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ButtonConfig {
  network: "testnet" | "mainnet" | string;
  contractAddress: string;
  contractDeployBlock: string;
  tokenAddress: string;
  tokenUrl: string;
  pairLabel: string;
}

interface Window {
  BUTTON_CONFIG?: ButtonConfig;
}
```

- [ ] **Step 9: Write stub `web/src/App.tsx`**

```tsx
export default function App() {
  return <div>BUTTON — scaffold OK</div>;
}
```

- [ ] **Step 10: Write `web/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 11: Install dependencies**

Run: `cd web && npm install`
Expected: installs without errors, creates `web/package-lock.json` and `web/node_modules/`.

- [ ] **Step 12: Verify typecheck, lint, and build**

Run: `cd web && npm run typecheck && npm run lint && npm run build`
Expected: all three exit 0. `web/dist/index.html` and `web/dist/assets/*.js` exist.

- [ ] **Step 13: Commit**

```bash
git add web/package.json web/package-lock.json web/tsconfig.json web/tsconfig.node.json web/vite.config.ts web/eslint.config.js web/index.html web/public/config.js web/src/main.tsx web/src/App.tsx web/src/vite-env.d.ts web/.gitignore
git commit -m "chore(web): scaffold Vite + React + TypeScript project"
```

Note: also create `web/.gitignore` with `node_modules` and `dist` if not already covered by the root `.gitignore` (it is, from `/Users/user/Projects/button-robinhood/.gitignore` — `node_modules/`, `dist/`, `web/dist/`, `web/node_modules/` are already listed, so no new gitignore file is needed; just confirm `git status` doesn't show `web/node_modules` or `web/dist` as untracked).

---

## Task 2: Domain layer — types, formatting, factions, network, runtime config

**Files:**
- Create: `web/src/domain/types.ts`
- Create: `web/src/domain/format.ts`
- Create: `web/src/domain/factions.ts`
- Create: `web/src/config/network.ts`
- Create: `web/src/config/runtimeConfig.ts`

**Interfaces:**
- Consumes: `window.BUTTON_CONFIG` (from Task 1 Step 7/`vite-env.d.ts`).
- Produces: `Faction` type, `FACTIONS: Record<number, Faction>`, `factionForRemaining(remaining: number): number`, `formatDuration(seconds: number): string`, `relativeTime(timestampSeconds: number, nowMs: number): string`, `shortAddress(value: string): string`, `txUrl(hash: string): string`, `addressUrl(addr: string): string`, `NETWORKS: Record<"mainnet" | "testnet", NetworkConfig>`, `runtimeConfig: RuntimeConfig` (singleton, computed once at module load), `PressEvent` type, `ExperimentState` type, `UserPressState` type — all consumed by every hook/component task from here on.

- [ ] **Step 1: Write `web/src/domain/types.ts`**

```ts
export interface Faction {
  id: number;
  name: string;
  range: string;
  color: string;
}

export interface ExperimentState {
  loaded: boolean;
  stale: boolean;
  started: boolean;
  alive: boolean;
  startedAt: number;
  deadline: number;
  totalPresses: number;
  closestCall: number;
  factionCounts: [number, number, number, number, number, number, number];
  currentBlock: number;
  chainOffsetMs: number;
}

export interface UserPressState {
  loaded: boolean;
  hasPressed: boolean;
  faction: number;
  remaining: number;
}

export interface PressEvent {
  key: string;
  txHash: string;
  presser: `0x${string}`;
  remaining: number;
  faction: number;
  timestamp: number;
  pressNumber: number;
  blockNumber: number;
  logIndex: number;
}
```

- [ ] **Step 2: Write `web/src/domain/factions.ts`**

```ts
import type { Faction } from "./types";

export const FACTIONS: Record<number, Faction> = {
  0: { id: 0, name: "GREY", range: "NEVER PRESSED", color: "#858585" },
  1: { id: 1, name: "PURPLE", range: "52–60s", color: "#8b5cf6" },
  2: { id: 2, name: "BLUE", range: "42–51s", color: "#3b82f6" },
  3: { id: 3, name: "GREEN", range: "32–41s", color: "#22c55e" },
  4: { id: 4, name: "YELLOW", range: "22–31s", color: "#f4d03f" },
  5: { id: 5, name: "ORANGE", range: "12–21s", color: "#f97316" },
  6: { id: 6, name: "RED", range: "0–11s", color: "#ef4444" }
};

export function factionForRemaining(remaining: number): number {
  if (remaining >= 52) return 1;
  if (remaining >= 42) return 2;
  if (remaining >= 32) return 3;
  if (remaining >= 22) return 4;
  if (remaining >= 12) return 5;
  return 6;
}
```

- [ ] **Step 3: Write `web/src/domain/format.ts`**

```ts
export function shortAddress(value: string | undefined | null): string {
  if (!value || value.length < 10) return "—";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export function relativeTime(timestampSeconds: number, nowMs: number): string {
  const diff = Math.max(0, Math.floor(nowMs / 1000 - timestampSeconds));
  if (diff < 5) return "NOW";
  if (diff < 60) return `${diff}s AGO`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m AGO`;
  return `${Math.floor(diff / 3600)}h AGO`;
}
```

- [ ] **Step 4: Write `web/src/config/network.ts`**

```ts
import { defineChain } from "viem";

export interface NetworkConfig {
  key: "mainnet" | "testnet";
  name: string;
  short: string;
  chainId: number;
  rpc: string;
  explorer: string;
  chain: ReturnType<typeof defineChain>;
}

const mainnetChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } }
});

const testnetChain = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" } }
});

export const NETWORKS: Record<"mainnet" | "testnet", NetworkConfig> = {
  mainnet: {
    key: "mainnet",
    name: "Robinhood Chain",
    short: "MAINNET",
    chainId: 4663,
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com",
    chain: mainnetChain
  },
  testnet: {
    key: "testnet",
    name: "Robinhood Chain Testnet",
    short: "TESTNET",
    chainId: 46630,
    rpc: "https://rpc.testnet.chain.robinhood.com",
    explorer: "https://explorer.testnet.chain.robinhood.com",
    chain: testnetChain
  }
};

export function txUrl(explorer: string, hash: string): string {
  return `${explorer}/tx/${hash}`;
}

export function addressUrl(explorer: string, addr: string): string {
  return `${explorer}/address/${addr}`;
}
```

- [ ] **Step 5: Write `web/src/config/runtimeConfig.ts`**

```ts
import { NETWORKS, type NetworkConfig } from "./network";

export interface RuntimeConfig {
  raw: ButtonConfig;
  network: NetworkConfig;
  contractAddress: `0x${string}` | "";
  previewMode: boolean;
  deployBlock: bigint | null;
  tokenUrl: string;
}

function computeRuntimeConfig(): RuntimeConfig {
  const raw = window.BUTTON_CONFIG || {
    network: "testnet",
    contractAddress: "",
    contractDeployBlock: "",
    tokenAddress: "",
    tokenUrl: "",
    pairLabel: "BUTTON / RDDT"
  };
  const network = NETWORKS[raw.network as "mainnet" | "testnet"] || NETWORKS.testnet;
  const contract = String(raw.contractAddress || "").trim();
  const liveConfigured = /^0x[a-fA-F0-9]{40}$/.test(contract) && !/^0x0{40}$/i.test(contract);
  return {
    raw,
    network,
    contractAddress: liveConfigured ? (contract as `0x${string}`) : "",
    previewMode: !liveConfigured,
    deployBlock: raw.contractDeployBlock ? BigInt(raw.contractDeployBlock) : null,
    tokenUrl: raw.tokenUrl || ""
  };
}

export const runtimeConfig: RuntimeConfig = computeRuntimeConfig();
```

- [ ] **Step 6: Verify typecheck**

Run: `cd web && npm run typecheck`
Expected: exits 0, no errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/domain web/src/config/network.ts web/src/config/runtimeConfig.ts
git commit -m "feat(web): port domain types, formatting, factions, network and runtime config"
```

---

## Task 3: ABI typing + wagmi/query providers

**Files:**
- Create: `web/src/abi/buttonExperiment.ts`
- Create: `web/src/config/wagmi.ts`
- Modify: `web/src/main.tsx`

**Interfaces:**
- Consumes: `NETWORKS`, `runtimeConfig` (Task 2).
- Produces: `buttonExperimentAbi` (typed `as const` ABI array), `wagmiConfig` (wagmi `Config` instance), `queryClient` (TanStack `QueryClient` instance) — every later hook that reads/writes the contract or uses wagmi hooks needs `wagmiConfig`/`queryClient` provided at the root, which this task wires into `main.tsx`.

- [ ] **Step 1: Copy the ABI into a typed TS module**

Read `contracts/ButtonExperiment.abi.json` and paste its exact contents as a `const` array in `web/src/abi/buttonExperiment.ts`:

```ts
export const buttonExperimentAbi = [
  { "inputs": [{ "internalType": "address", "name": "starter_", "type": "address" }], "stateMutability": "nonpayable", "type": "constructor" },
  { "inputs": [], "name": "AlreadyFinalized", "type": "error" },
  { "inputs": [], "name": "AlreadyPressed", "type": "error" },
  { "inputs": [], "name": "AlreadyStarted", "type": "error" },
  { "inputs": [], "name": "ExperimentEnded", "type": "error" },
  { "inputs": [], "name": "ExperimentStillAlive", "type": "error" },
  { "inputs": [], "name": "NotStarted", "type": "error" },
  { "inputs": [], "name": "OnlyStarter", "type": "error" },
  { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "uint256", "name": "endedAt", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "totalPresses", "type": "uint256" }, { "indexed": false, "internalType": "uint8", "name": "closestCall", "type": "uint8" }], "name": "ExperimentFinalized", "type": "event" },
  { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "uint256", "name": "timestamp", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "deadline", "type": "uint256" }], "name": "ExperimentStarted", "type": "event" },
  { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "presser", "type": "address" }, { "indexed": false, "internalType": "uint8", "name": "remaining", "type": "uint8" }, { "indexed": false, "internalType": "uint8", "name": "faction", "type": "uint8" }, { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "pressNumber", "type": "uint256" }], "name": "Pressed", "type": "event" },
  { "inputs": [], "name": "BLUE", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "GREEN", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "ORANGE", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "PURPLE", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "RED", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "WINDOW", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "YELLOW", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "closestCall", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "deadline", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "endedAt", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "name": "factionCounts", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "finalize", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "finalized", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "", "type": "address" }], "name": "hasPressed", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "isAlive", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "lastPressedAt", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "press", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "", "type": "address" }], "name": "pressFaction", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "", "type": "address" }], "name": "pressRemaining", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "start", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "started", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "startedAt", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "starter", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "timeLeft", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "totalPresses", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }
] as const;
```

- [ ] **Step 2: Write `web/src/config/wagmi.ts`**

```ts
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { NETWORKS } from "./network";

export const wagmiConfig = createConfig({
  chains: [NETWORKS.testnet.chain, NETWORKS.mainnet.chain],
  connectors: [injected()],
  transports: {
    [NETWORKS.testnet.chain.id]: http(NETWORKS.testnet.rpc),
    [NETWORKS.mainnet.chain.id]: http(NETWORKS.mainnet.rpc)
  }
});
```

- [ ] **Step 3: Wire providers into `web/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "./config/wagmi";
import App from "./App";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);
```

- [ ] **Step 4: Verify typecheck and build**

Run: `cd web && npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/abi web/src/config/wagmi.ts web/src/main.tsx
git commit -m "feat(web): add typed ABI and wagmi/react-query providers"
```

---

## Task 4: Global styles (tokens + base)

**Files:**
- Create: `web/src/styles/tokens.css`
- Create: `web/src/styles/global.css`
- Modify: `web/src/main.tsx`

**Interfaces:**
- Produces: CSS custom properties (`--bg`, `--panel`, `--ink`, `--red`, faction colors, `--max`, etc.) consumed by name in every later component's CSS Module.

- [ ] **Step 1: Write `web/src/styles/tokens.css`** (ported verbatim from `web/styles.css:1-18`)

```css
:root {
  --bg: #080808;
  --panel: #101010;
  --panel-2: #151515;
  --ink: #f2efe8;
  --muted: #8e8b85;
  --line: #292929;
  --red: #ef2b24;
  --red-dark: #7f0e0b;
  --purple: #8b5cf6;
  --blue: #3b82f6;
  --green: #22c55e;
  --yellow: #f4d03f;
  --orange: #f97316;
  --faction-red: #ef4444;
  --grey: #858585;
  --max: 1320px;
}
```

- [ ] **Step 2: Write `web/src/styles/global.css`** (ported verbatim from `web/styles.css:20-47,278-279,340-342`)

```css
* { box-sizing: border-box; }
html { scroll-behavior: smooth; background: var(--bg); }
body {
  margin: 0;
  background:
    linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px),
    var(--bg);
  background-size: 36px 36px;
  color: var(--ink);
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  min-height: 100vh;
}
body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: .18;
  background-image: radial-gradient(circle at 30% 20%, rgba(255,255,255,.1) 0 1px, transparent 1px);
  background-size: 5px 5px;
  mix-blend-mode: overlay;
  z-index: 99;
}
button, a { font: inherit; }
a { color: inherit; text-decoration: none; }
button { color: inherit; }

body.warning .hero::after {
  content: "";
  position: absolute;
  inset: 0;
  border: 1px solid rgba(239,43,36,.25);
  pointer-events: none;
  animation: warningGlow 1s ease-in-out infinite alternate;
}
@keyframes warningGlow { from { box-shadow: inset 0 0 0 rgba(239,43,36,0); } to { box-shadow: inset 0 0 90px rgba(239,43,36,.06); } }

@media (max-width: 640px) {
  body { background-size: 28px 28px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: .001ms !important;
  }
}
```

- [ ] **Step 3: Import both stylesheets in `web/src/main.tsx`** (add as the first two imports, before the `App` import)

```tsx
import "./styles/tokens.css";
import "./styles/global.css";
```

- [ ] **Step 4: Verify build**

Run: `cd web && npm run build`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/styles web/src/main.tsx
git commit -m "feat(web): port global design tokens and base styles"
```

---

## Task 5: Audio module

**Files:**
- Create: `web/src/audio/tick.ts`

**Interfaces:**
- Produces: `playTone(freq?: number, duration?: number, gain?: number): void`, `soundEnabled: boolean` (getter via `isSoundEnabled()`), `setSoundEnabled(value: boolean): void` — consumed by `useCountdown` (Task 9), `usePressFeed` (Task 7, for the new-press chime), and `TopBar`'s sound toggle (Task 10).

- [ ] **Step 1: Write `web/src/audio/tick.ts`** (ported from `web/app.js:121-135`, module-level flag replacing the original global `soundEnabled` variable)

```ts
let soundEnabled = false;
let audioCtx: AudioContext | null = null;

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

export function setSoundEnabled(value: boolean): void {
  soundEnabled = value;
}

export function playTone(freq = 560, duration = 0.035, gain = 0.025): void {
  if (!soundEnabled) return;
  try {
    audioCtx ||= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.type = "square";
    g.gain.value = gain;
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {
    // AudioContext unavailable or blocked — sound is best-effort only.
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd web && npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add web/src/audio
git commit -m "feat(web): port tick sound module"
```

---

## Task 6: `useExperimentState` hook

**Files:**
- Create: `web/src/hooks/useExperimentState.ts`

**Interfaces:**
- Consumes: `runtimeConfig` (Task 2), `buttonExperimentAbi` (Task 3), wagmi's `usePublicClient()`.
- Produces: `useExperimentState(): ExperimentState` — consumed by `PressStage`, `StatsPanel`, `SystemStrip`, `ProofSection` (later tasks). `ExperimentState.chainOffsetMs` is consumed by `useCountdown` for chain-time correction.

- [ ] **Step 1: Write `web/src/hooks/useExperimentState.ts`** (ported from `web/app.js`'s `refreshCore`, `web/app.js:422-461`)

```ts
import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { buttonExperimentAbi } from "../abi/buttonExperiment";
import { runtimeConfig } from "../config/runtimeConfig";
import type { ExperimentState } from "../domain/types";

const INITIAL_STATE: ExperimentState = {
  loaded: false,
  stale: false,
  started: false,
  alive: false,
  startedAt: 0,
  deadline: 0,
  totalPresses: 0,
  closestCall: 0,
  factionCounts: [0, 0, 0, 0, 0, 0, 0],
  currentBlock: 0,
  chainOffsetMs: 0
};

export function useExperimentState(): ExperimentState {
  const [state, setState] = useState<ExperimentState>(INITIAL_STATE);
  const publicClient = usePublicClient({ chainId: runtimeConfig.network.chainId });

  useEffect(() => {
    if (runtimeConfig.previewMode || !publicClient) return;
    const contract = runtimeConfig.contractAddress as `0x${string}`;
    let cancelled = false;

    async function refresh() {
      try {
        const code = await publicClient!.getCode({ address: contract });
        if (!code || code === "0x") throw new Error("No contract code at configured address");

        const [block, started, startedAt, deadline, totalPresses, closestCall, alive, ...counts] = await Promise.all([
          publicClient!.getBlock({ blockTag: "latest" }),
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "started" }),
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "startedAt" }),
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "deadline" }),
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "totalPresses" }),
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "closestCall" }),
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "isAlive" }),
          ...[1, 2, 3, 4, 5, 6].map((i) =>
            publicClient!.readContract({
              address: contract,
              abi: buttonExperimentAbi,
              functionName: "factionCounts",
              args: [BigInt(i)]
            })
          )
        ]);

        if (cancelled) return;
        const chainOffsetMs = Number(block.timestamp) * 1000 - Date.now();
        setState({
          loaded: true,
          stale: false,
          started: started as boolean,
          alive: alive as boolean,
          startedAt: Number(startedAt),
          deadline: Number(deadline),
          totalPresses: Number(totalPresses),
          closestCall: Number(closestCall),
          factionCounts: [0, ...counts.map((c) => Number(c))] as ExperimentState["factionCounts"],
          currentBlock: Number(block.number),
          chainOffsetMs
        });
      } catch (error) {
        if (cancelled) return;
        console.warn("Core state refresh failed", error);
        setState((prev) => ({ ...prev, stale: prev.loaded }));
      }
    }

    refresh();
    const interval = setInterval(refresh, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [publicClient]);

  return state;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd web && npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add web/src/hooks/useExperimentState.ts
git commit -m "feat(web): add useExperimentState hook"
```

---

## Task 7: `usePressFeed` hook

**Files:**
- Create: `web/src/hooks/usePressFeed.ts`

**Interfaces:**
- Consumes: `runtimeConfig`, `buttonExperimentAbi`, `playTone` (Task 5), `ExperimentState` (as a parameter, to know `currentBlock` and gate on `loaded`).
- Produces: `usePressFeed(state: ExperimentState): { events: PressEvent[]; freshness: "SYNCING" | "LIVE · ONCHAIN" | "TAPE STALE"; latestKey: string }` — consumed by `LivePressFeed`, `StatsPanel` (latest presser / streak), `CountdownDisplay` (pulse-on-new-press via `latestKey`).

- [ ] **Step 1: Write `web/src/hooks/usePressFeed.ts`** (ported from `web/app.js:463-506`)

```ts
import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { buttonExperimentAbi } from "../abi/buttonExperiment";
import { runtimeConfig } from "../config/runtimeConfig";
import { playTone } from "../audio/tick";
import type { ExperimentState, PressEvent } from "../domain/types";

const PRESSED_EVENT = buttonExperimentAbi.find((item) => item.type === "event" && item.name === "Pressed")!;

export interface PressFeed {
  events: PressEvent[];
  freshness: "SYNCING" | "LIVE · ONCHAIN" | "TAPE STALE";
  latestKey: string;
}

export function usePressFeed(state: ExperimentState): PressFeed {
  const [feed, setFeed] = useState<PressFeed>({ events: [], freshness: "SYNCING", latestKey: "" });
  const publicClient = usePublicClient({ chainId: runtimeConfig.network.chainId });
  const latestKeyRef = useRef("");

  useEffect(() => {
    if (runtimeConfig.previewMode || !state.loaded || !publicClient) return;
    const contract = runtimeConfig.contractAddress as `0x${string}`;
    let cancelled = false;

    async function refresh() {
      try {
        const fromBlock = runtimeConfig.deployBlock ?? BigInt(Math.max(0, state.currentBlock - 20_000));
        let logs;
        try {
          logs = await publicClient!.getLogs({
            address: contract,
            event: PRESSED_EVENT as never,
            fromBlock,
            toBlock: "latest"
          });
        } catch {
          logs = await publicClient!.getLogs({
            address: contract,
            event: PRESSED_EVENT as never,
            fromBlock: BigInt(Math.max(0, state.currentBlock - 5_000)),
            toBlock: "latest"
          });
        }

        const decoded: PressEvent[] = logs
          .map((log) => {
            const args = (log as unknown as { args: { presser: `0x${string}`; remaining: bigint; faction: bigint; timestamp: bigint; pressNumber: bigint } }).args;
            return {
              key: `${log.transactionHash}:${log.logIndex}`,
              txHash: log.transactionHash ?? "",
              presser: args.presser,
              remaining: Number(args.remaining),
              faction: Number(args.faction),
              timestamp: Number(args.timestamp),
              pressNumber: Number(args.pressNumber),
              blockNumber: Number(log.blockNumber ?? 0n),
              logIndex: Number(log.logIndex ?? 0)
            };
          })
          .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);

        if (cancelled) return;
        const nextKey = decoded[0]?.key || "";
        if (latestKeyRef.current && nextKey && nextKey !== latestKeyRef.current) {
          playTone(920, 0.07, 0.035);
        }
        latestKeyRef.current = nextKey;
        setFeed({ events: decoded.slice(0, 25), freshness: "LIVE · ONCHAIN", latestKey: nextKey });
      } catch (error) {
        if (cancelled) return;
        console.warn("Log refresh failed", error);
        setFeed((prev) => ({ ...prev, freshness: "TAPE STALE" }));
      }
    }

    refresh();
    const interval = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [publicClient, state.loaded, state.currentBlock]);

  return feed;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd web && npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add web/src/hooks/usePressFeed.ts
git commit -m "feat(web): add usePressFeed hook"
```

---

## Task 8: `useUserPress` and `useStreak` hooks

**Files:**
- Create: `web/src/hooks/useUserPress.ts`
- Create: `web/src/hooks/useStreak.ts`

**Interfaces:**
- Consumes: `runtimeConfig`, `buttonExperimentAbi`, wagmi's `useAccount()`/`usePublicClient()`, `PressEvent[]` (from `usePressFeed`, Task 7).
- Produces: `useUserPress(): UserPressState`, `useStreak(events: PressEvent[]): number` — consumed by `IdentityPanel`, `PressStage`, `StatsPanel`.

- [ ] **Step 1: Write `web/src/hooks/useUserPress.ts`** (ported from `web/app.js:401-420`)

```ts
import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { buttonExperimentAbi } from "../abi/buttonExperiment";
import { runtimeConfig } from "../config/runtimeConfig";
import type { UserPressState } from "../domain/types";

const INITIAL_STATE: UserPressState = { loaded: false, hasPressed: false, faction: 0, remaining: 0 };

export function useUserPress(): UserPressState {
  const [state, setState] = useState<UserPressState>(INITIAL_STATE);
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: runtimeConfig.network.chainId });

  useEffect(() => {
    if (runtimeConfig.previewMode || !address || !publicClient) {
      setState(INITIAL_STATE);
      return;
    }
    const contract = runtimeConfig.contractAddress as `0x${string}`;
    let cancelled = false;

    async function refresh() {
      try {
        const [hasPressed, faction, remaining] = await Promise.all([
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "hasPressed", args: [address!] }),
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "pressFaction", args: [address!] }),
          publicClient!.readContract({ address: contract, abi: buttonExperimentAbi, functionName: "pressRemaining", args: [address!] })
        ]);
        if (cancelled) return;
        setState({ loaded: true, hasPressed: hasPressed as boolean, faction: Number(faction), remaining: Number(remaining) });
      } catch (error) {
        if (cancelled) return;
        console.warn("User-state read failed", error);
        setState((prev) => ({ ...prev, loaded: false }));
      }
    }

    refresh();
    const interval = setInterval(refresh, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [address, publicClient]);

  return state;
}
```

- [ ] **Step 2: Write `web/src/hooks/useStreak.ts`** (new — see design spec section 6, "current streak" = count of most recent consecutive presses sharing the same faction)

```ts
import { useMemo } from "react";
import type { PressEvent } from "../domain/types";

export function useStreak(events: PressEvent[]): number {
  return useMemo(() => {
    if (events.length === 0) return 0;
    const leadingFaction = events[0].faction;
    let streak = 0;
    for (const event of events) {
      if (event.faction !== leadingFaction) break;
      streak += 1;
    }
    return streak;
  }, [events]);
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd web && npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/hooks/useUserPress.ts web/src/hooks/useStreak.ts
git commit -m "feat(web): add useUserPress and useStreak hooks"
```

---

## Task 9: `useCountdown` and `usePreviewClock` hooks

**Files:**
- Create: `web/src/hooks/useCountdown.ts`
- Create: `web/src/hooks/usePreviewClock.ts`

**Interfaces:**
- Consumes: `playTone` (Task 5), `factionForRemaining` (Task 2).
- Produces: `useCountdown(deadlineMs: number | null, options: { sealed: boolean; alive: boolean }): CountdownReading` where `CountdownReading = { label: string; urgent: boolean; critical: boolean; remainingMs: number }` — source-agnostic (works for both real chain deadlines and preview mode), consumed by `CountdownDisplay` (Task 11). `usePreviewClock(): PreviewClockState` (self-contained local simulation) — consumed by `PressStage` (Task 11) only when `runtimeConfig.previewMode` is true.

- [ ] **Step 1: Write `web/src/hooks/useCountdown.ts`** (ported from `web/app.js:508-551`, parameterized instead of reading module-global mutable state)

```ts
import { useEffect, useRef, useState } from "react";
import { playTone } from "../audio/tick";

export interface CountdownReading {
  label: string;
  urgent: boolean;
  critical: boolean;
  remainingMs: number;
}

const SEALED_READING: CountdownReading = { label: "00:--", urgent: false, critical: false, remainingMs: 0 };

export function useCountdown(deadlineMs: number | null, options: { sealed: boolean; alive: boolean }): CountdownReading {
  const [reading, setReading] = useState<CountdownReading>(SEALED_READING);
  const lastTickSecondRef = useRef<number | null>(null);
  const { sealed, alive } = options;

  useEffect(() => {
    if (sealed || deadlineMs === null) {
      setReading(SEALED_READING);
      document.body.classList.remove("warning");
      return;
    }

    let frame: number;
    function tick() {
      const remainingMs = Math.max(0, deadlineMs! - Date.now());
      const secondsWhole = Math.floor(remainingMs / 1000);
      const hundredths = Math.floor((remainingMs % 1000) / 10);
      const label = `00:${String(secondsWhole).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
      const remainingSec = remainingMs / 1000;
      const urgent = alive && remainingSec <= 12;
      const critical = alive && remainingSec <= 5;

      if (urgent && secondsWhole !== lastTickSecondRef.current) {
        lastTickSecondRef.current = secondsWhole;
        playTone(remainingSec <= 5 ? 780 : 520, 0.028, remainingSec <= 5 ? 0.035 : 0.018);
      }
      if (!urgent) lastTickSecondRef.current = null;

      document.body.classList.toggle("warning", urgent);
      setReading({ label, urgent, critical, remainingMs });
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [deadlineMs, sealed, alive]);

  return reading;
}
```

- [ ] **Step 2: Write `web/src/hooks/usePreviewClock.ts`** (ported from `web/app.js`'s `preview` object and `previewPress()`, `web/app.js:88-98,612-636`)

```ts
import { useCallback, useState } from "react";
import { factionForRemaining } from "../domain/factions";
import type { PressEvent } from "../domain/types";

export interface PreviewClockState {
  startedAtMs: number;
  deadlineMs: number;
  pressed: boolean;
  faction: number;
  remaining: number;
  total: number;
  closest: number;
  factionCounts: [number, number, number, number, number, number, number];
  ended: boolean;
  events: PressEvent[];
  press: () => void;
}

export function usePreviewClock(): PreviewClockState {
  const [startedAtMs] = useState(() => Date.now());
  const [deadlineMs, setDeadlineMs] = useState(() => Date.now() + 60_000);
  const [pressed, setPressed] = useState(false);
  const [faction, setFaction] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const [closest, setClosest] = useState(0);
  const [factionCounts, setFactionCounts] = useState<[number, number, number, number, number, number, number]>([0, 0, 0, 0, 0, 0, 0]);
  const [ended, setEnded] = useState(false);
  const [events, setEvents] = useState<PressEvent[]>([]);

  const press = useCallback(() => {
    setPressed((alreadyPressed) => {
      if (alreadyPressed || ended) return alreadyPressed;
      const left = Math.max(1, Math.min(60, Math.ceil((deadlineMs - Date.now()) / 1000)));
      const nextFaction = factionForRemaining(left);
      setFaction(nextFaction);
      setRemaining(left);
      setTotal((t) => t + 1);
      setClosest(left);
      setFactionCounts((counts) => {
        const next = [...counts] as typeof counts;
        next[nextFaction] += 1;
        return next;
      });
      setDeadlineMs(Date.now() + 60_000);
      setEvents((prev) => [
        {
          key: `preview-${Date.now()}`,
          txHash: "",
          presser: "0x0000000000000000000000000000000000PVEW" as `0x${string}`,
          remaining: left,
          faction: nextFaction,
          timestamp: Math.floor(Date.now() / 1000),
          pressNumber: total + 1,
          blockNumber: 0,
          logIndex: 0
        },
        ...prev
      ]);
      return true;
    });
  }, [deadlineMs, ended, total]);

  return { startedAtMs, deadlineMs, pressed, faction, remaining, total, closest, factionCounts, ended, events, press };
}
```

**Note on preview expiry:** `PressStage` (Task 11) is responsible for calling `setEnded(true)`-equivalent behavior by checking `useCountdown`'s `remainingMs === 0` for the preview deadline and treating the preview as ended in its own render logic — `usePreviewClock` intentionally exposes only press-recording state; expiry is a derived read, not a state mutation, avoiding a render loop between two hooks fighting over the same "ended" flag.

- [ ] **Step 3: Verify typecheck**

Run: `cd web && npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/hooks/useCountdown.ts web/src/hooks/usePreviewClock.ts
git commit -m "feat(web): add useCountdown and usePreviewClock hooks"
```

---

## Task 10: Common components + layout shell

**Files:**
- Create: `web/src/components/common/PreviewBanner.tsx` + `.module.css`
- Create: `web/src/components/common/StatusPill.tsx` + `.module.css`
- Create: `web/src/components/common/Skeleton.tsx` + `.module.css`
- Create: `web/src/components/layout/TopBar.tsx` + `.module.css`
- Create: `web/src/components/layout/SystemStrip.tsx` + `.module.css`
- Create: `web/src/components/layout/AppShell.tsx` + `.module.css`

**Interfaces:**
- Consumes: `runtimeConfig`, `shortAddress` (Task 2), `isSoundEnabled`/`setSoundEnabled`/`playTone` (Task 5), wagmi's `useAccount`/`useConnect`/`useDisconnect`/`useSwitchChain`, `ExperimentState` (as props).
- Produces: `<AppShell>` (default export, wraps children with the sticky `PreviewBanner` + `TopBar` + content slot + footer), `<TopBar walletState connectedLabel onConnect onSwitchNetwork soundOn onToggleSound />`, `<SystemStrip state chainName currentBlock deployBlock uniqueParticipants experimentStateLabel />` — consumed by `App.tsx` (Task 14).

- [ ] **Step 1: Write `web/src/components/common/PreviewBanner.module.css`** (ported from `web/styles.css:49-60`)

```css
.banner {
  position: sticky;
  top: 0;
  z-index: 200;
  background: #f4d03f;
  color: #080808;
  text-align: center;
  font: 800 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .16em;
  padding: 9px 12px;
  border-bottom: 1px solid #080808;
}
```

- [ ] **Step 2: Write `web/src/components/common/PreviewBanner.tsx`**

```tsx
import styles from "./PreviewBanner.module.css";

export default function PreviewBanner() {
  return <div className={styles.banner}>PREVIEW MODE — NOT ONCHAIN</div>;
}
```

- [ ] **Step 3: Write `web/src/components/common/StatusPill.module.css`** (ported from `web/styles.css:134-138`)

```css
.line {
  margin-top: 22px;
  color: #8c8983;
  font-size: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  text-transform: uppercase;
  letter-spacing: .12em;
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: #777; }
.dot.live { background: #54d27a; box-shadow: 0 0 15px rgba(84,210,122,.55); }
.dot.dead { background: var(--red); }
.dot.stale { background: var(--yellow); }
```

- [ ] **Step 4: Write `web/src/components/common/StatusPill.tsx`**

```tsx
import styles from "./StatusPill.module.css";

export type StatusTone = "" | "live" | "dead" | "stale";

export default function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <div className={styles.line} aria-live="polite">
      <span className={`${styles.dot} ${tone ? styles[tone] : ""}`} />
      <span>{label}</span>
    </div>
  );
}
```

- [ ] **Step 5: Write `web/src/components/common/Skeleton.module.css`**

```css
.skeleton {
  background: linear-gradient(90deg, #141414 25%, #1c1c1c 37%, #141414 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}
@keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
@media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }
```

- [ ] **Step 6: Write `web/src/components/common/Skeleton.tsx`**

```tsx
import styles from "./Skeleton.module.css";

export default function Skeleton({ height = 14, width = "100%" }: { height?: number | string; width?: number | string }) {
  return <div className={styles.skeleton} style={{ height, width }} aria-hidden="true" />;
}
```

- [ ] **Step 7: Write `web/src/components/layout/TopBar.module.css`** (ported from `web/styles.css:62-99,281-283`)

```css
.topbar {
  width: min(calc(100% - 32px), var(--max));
  margin: 0 auto;
  min-height: 72px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  border-bottom: 1px solid var(--line);
  position: relative;
  z-index: 20;
}
.brand { justify-self: start; display: inline-flex; gap: 8px; align-items: center; font-weight: 850; letter-spacing: -.03em; }
.brand span { color: var(--muted); font-weight: 600; }
.brandDot { width: 11px; height: 11px; border-radius: 50%; background: var(--red); box-shadow: 0 0 16px rgba(239,43,36,.55); }
.nav { display: flex; gap: 28px; color: #b9b6b0; font-size: 13px; justify-self: center; }
.nav a:hover { color: #fff; }
.actions { justify-self: end; display: flex; align-items: center; gap: 8px; }
.networkPill, .walletBtn, .soundBtn {
  border: 1px solid var(--line);
  background: #111;
  height: 38px;
  padding: 0 13px;
  font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .07em;
  cursor: pointer;
}
.networkPill { color: #aaa69e; }
.soundBtn { color: #77736d; padding: 0 11px; font-size: 9px; }
.soundBtn[aria-pressed="true"] { color: #f2efe8; border-color: #4a4a4a; }
.walletBtn { background: var(--ink); color: #090909; border-color: var(--ink); }
.walletBtn:hover { background: white; }

@media (max-width: 900px) {
  .topbar { grid-template-columns: 1fr auto; min-height: 64px; }
  .nav, .networkPill, .soundBtn { display: none; }
}
@media (max-width: 640px) {
  .walletBtn { max-width: 130px; overflow: hidden; text-overflow: ellipsis; }
}
```

- [ ] **Step 8: Write `web/src/components/layout/TopBar.tsx`** (ported from `web/app.js`'s wallet-connect/network-switch handlers and `renderCore`'s network-pill text, `web/app.js:558-602,690-701`)

```tsx
import { useAccount, useConnect, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors";
import { shortAddress } from "../../domain/format";
import { runtimeConfig } from "../../config/runtimeConfig";
import { isSoundEnabled, playTone, setSoundEnabled } from "../../audio/tick";
import { useState } from "react";
import styles from "./TopBar.module.css";

export default function TopBar() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, isPending: connecting } = useConnect();
  const { switchChain } = useSwitchChain();
  const [soundOn, setSoundOn] = useState(isSoundEnabled());

  const walletLabel = runtimeConfig.previewMode
    ? "PREVIEW MODE"
    : isConnected && address
      ? shortAddress(address)
      : connecting
        ? "CONNECTING…"
        : "CONNECT WALLET";

  const networkLabel = `ROBINHOOD · ${runtimeConfig.previewMode ? "PREVIEW" : runtimeConfig.network.short}`;
  const wrongNetwork = !runtimeConfig.previewMode && isConnected && chainId !== runtimeConfig.network.chainId;

  function toggleSound() {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
    if (next) playTone(640, 0.045, 0.02);
  }

  function handleWalletClick() {
    if (runtimeConfig.previewMode || isConnected) return;
    connect({ connector: injected() });
  }

  function handleNetworkClick() {
    if (runtimeConfig.previewMode || !wrongNetwork) return;
    switchChain({ chainId: runtimeConfig.network.chainId });
  }

  return (
    <header className={styles.topbar}>
      <a className={styles.brand} href="./">
        <span className={styles.brandDot} />
        BUTTON <span>/ RDDT</span>
      </a>
      <nav className={styles.nav}>
        <a href="#experiment">Experiment</a>
        <a href="#lore">Lore</a>
        <a href="#stats">Stats</a>
      </nav>
      <div className={styles.actions}>
        <button type="button" className={styles.soundBtn} aria-pressed={soundOn} onClick={toggleSound}>
          {soundOn ? "SOUND ON" : "SOUND OFF"}
        </button>
        <button
          type="button"
          className={styles.networkPill}
          onClick={handleNetworkClick}
          style={wrongNetwork ? { color: "#f4d03f", borderColor: "#f4d03f" } : undefined}
        >
          {wrongNetwork ? "WRONG NETWORK · SWITCH" : networkLabel}
        </button>
        <button type="button" className={styles.walletBtn} onClick={handleWalletClick} disabled={connecting}>
          {walletLabel}
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 9: Write `web/src/components/layout/SystemStrip.module.css`** (ported from `web/styles.css:261-267,296-301,331-334`)

```css
.strip {
  width: min(calc(100% - 32px), var(--max));
  margin: 0 auto;
  min-height: 84px;
  border: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  flex-wrap: wrap;
  gap: 12px;
  color: #5f5c57;
  font: 750 9px ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .1em;
}
.strip span { display: flex; gap: 6px; align-items: center; }
.strip code { color: #dedbd4; }

@media (max-width: 640px) {
  .strip { padding: 12px; }
}
```

- [ ] **Step 10: Write `web/src/components/layout/SystemStrip.tsx`** (new component covering the required bottom strip: chain, block height, latest block, unique participants, experiment state)

```tsx
import styles from "./SystemStrip.module.css";
import { runtimeConfig } from "../../config/runtimeConfig";
import type { ExperimentState } from "../../domain/types";

export default function SystemStrip({ state }: { state: ExperimentState }) {
  const experimentStateLabel = runtimeConfig.previewMode
    ? "PREVIEW"
    : !state.loaded
      ? "LOADING"
      : !state.started
        ? "SEALED"
        : state.alive
          ? "LIVE"
          : "ENDED";

  return (
    <footer className={styles.strip}>
      <span>CHAIN <code>{runtimeConfig.previewMode ? "—" : runtimeConfig.network.name.toUpperCase()}</code></span>
      <span>DEPLOY BLOCK <code>{runtimeConfig.raw.contractDeployBlock || "—"}</code></span>
      <span>LATEST BLOCK <code>{runtimeConfig.previewMode ? "—" : state.currentBlock || "—"}</code></span>
      <span>UNIQUE PARTICIPANTS <code>{runtimeConfig.previewMode ? "—" : state.totalPresses.toLocaleString()}</code></span>
      <span>STATE <code>{experimentStateLabel}</code></span>
    </footer>
  );
}
```

- [ ] **Step 11: Write `web/src/components/layout/AppShell.module.css`** (ported from `web/styles.css:101`)

```css
.main {
  width: min(calc(100% - 32px), var(--max));
  margin: 0 auto;
}
```

- [ ] **Step 12: Write `web/src/components/layout/AppShell.tsx`**

```tsx
import type { ReactNode } from "react";
import PreviewBanner from "../common/PreviewBanner";
import TopBar from "./TopBar";
import { runtimeConfig } from "../../config/runtimeConfig";
import styles from "./AppShell.module.css";

export default function AppShell({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  return (
    <>
      {runtimeConfig.previewMode && <PreviewBanner />}
      <TopBar />
      <main className={styles.main}>{children}</main>
      {footer}
    </>
  );
}
```

- [ ] **Step 13: Verify typecheck and build**

Run: `cd web && npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 14: Commit**

```bash
git add web/src/components/common web/src/components/layout
git commit -m "feat(web): add common components and layout shell"
```

---

## Task 11: Press components (the core interactive flow)

**Files:**
- Create: `web/src/components/press/CountdownDisplay.tsx` + `.module.css`
- Create: `web/src/components/press/PressButton.tsx` + `.module.css`
- Create: `web/src/components/press/PressStatusLine.tsx` + `.module.css`
- Create: `web/src/components/press/PressStage.tsx` + `.module.css`

**Interfaces:**
- Consumes: `useExperimentState`, `usePressFeed`, `useUserPress`, `useCountdown`, `usePreviewClock` (Tasks 6–9), wagmi's `useAccount`/`useSwitchChain`/`useWriteContract`/`useWaitForTransactionReceipt`, `buttonExperimentAbi`, `runtimeConfig`, `txUrl`/`addressUrl` (Task 2 `network.ts`).
- Produces: `<PressStage />` — the single component `App.tsx` mounts for the entire center column; owns all press-related state transitions internally so no sibling component needs press-flow state.

- [ ] **Step 1: Write `web/src/components/press/CountdownDisplay.module.css`** (ported from `web/styles.css:139-165,284-287,311-313`)

```css
.wrap { margin-top: 37px; position: relative; z-index: 2; text-align: center; }
.systemLabel { color: #6f6c67; font-size: 9px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; text-transform: uppercase; letter-spacing: .12em; }
.timer {
  margin-top: 8px;
  font: 800 clamp(70px, 11vw, 158px)/.88 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  letter-spacing: -.085em;
  font-variant-numeric: tabular-nums;
  color: #f7f4ed;
  text-shadow: 0 0 45px rgba(255,255,255,.08);
}
.timer.urgent { color: #ff5b54; text-shadow: 0 0 36px rgba(239,43,36,.38); }
.timer.critical { animation: criticalPulse .55s steps(2,end) infinite; }
@keyframes criticalPulse { 50% { opacity: .58; } }
.deadlineLabel { margin-top: 11px; color: #696660; font-size: 9px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; text-transform: uppercase; letter-spacing: .12em; }

@media (max-width: 640px) {
  .timer { font-size: clamp(64px,24vw,105px); }
}
```

- [ ] **Step 2: Write `web/src/components/press/CountdownDisplay.tsx`**

```tsx
import { useEffect, useRef } from "react";
import styles from "./CountdownDisplay.module.css";
import type { CountdownReading } from "../../hooks/useCountdown";

export default function CountdownDisplay({
  reading,
  deadlineLabel,
  pulseKey
}: {
  reading: CountdownReading;
  deadlineLabel: string;
  pulseKey: string;
}) {
  const timerRef = useRef<HTMLDivElement>(null);
  const prevPulseKey = useRef(pulseKey);

  useEffect(() => {
    if (pulseKey && prevPulseKey.current && pulseKey !== prevPulseKey.current) {
      timerRef.current?.animate([{ transform: "scale(1.035)" }, { transform: "scale(1)" }], { duration: 380, easing: "ease-out" });
    }
    prevPulseKey.current = pulseKey;
  }, [pulseKey]);

  const classes = [styles.timer, reading.urgent && styles.urgent, reading.critical && styles.critical].filter(Boolean).join(" ");

  return (
    <div className={styles.wrap} aria-live="polite">
      <div className={styles.systemLabel}>SHARED TIMER · AUTHORITATIVE STATE ONCHAIN</div>
      <div ref={timerRef} className={classes} role="timer" aria-label="Shared countdown">
        {reading.label}
      </div>
      <div className={styles.deadlineLabel}>{deadlineLabel}</div>
    </div>
  );
}
```

- [ ] **Step 3: Write `web/src/components/press/PressButton.module.css`** (ported from `web/styles.css:154-208,285-288,312-316`)

```css
.stage { width: 390px; height: 390px; display: grid; place-items: center; position: relative; margin-top: -5px; z-index: 3; }
.dial { position: absolute; inset: 8px; border-radius: 50%; }
.dial::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: repeating-conic-gradient(from -3deg, rgba(255,255,255,.34) 0deg 1deg, transparent 1deg 6deg);
  -webkit-mask: radial-gradient(circle, transparent 0 68%, black 68% 70%, transparent 70%);
  mask: radial-gradient(circle, transparent 0 68%, black 68% 70%, transparent 70%);
  opacity: .4;
}
.plinth {
  width: 246px; height: 246px; border-radius: 50%; display: grid; place-items: center;
  background: radial-gradient(circle at 35% 28%, #525252 0, #282828 38%, #121212 72%, #050505 100%);
  border: 1px solid #595959;
  box-shadow: 0 38px 70px rgba(0,0,0,.72), inset 0 0 0 8px #171717, inset 0 0 0 10px #474747;
  position: relative;
}
.plinth::after { content: "IRREVERSIBLE"; position: absolute; bottom: -35px; color: #5e5b57; font: 700 9px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .28em; }
.button {
  width: 176px; height: 176px; border-radius: 50%; border: 1px solid #ff7772;
  background:
    radial-gradient(circle at 38% 28%, #ff756d 0 7%, transparent 8%),
    radial-gradient(circle at 50% 35%, #ff4038 0, #e82019 40%, #ab100c 72%, #650703 100%);
  box-shadow:
    inset 0 7px 13px rgba(255,255,255,.22),
    inset 0 -18px 28px rgba(75,0,0,.58),
    0 13px 0 #5b0906,
    0 20px 28px rgba(0,0,0,.7),
    0 0 48px rgba(239,43,36,.18);
  position: relative;
  cursor: pointer;
  transition: transform .12s ease, box-shadow .12s ease, filter .2s ease;
}
.button:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-2px); }
.button:active:not(:disabled) { transform: translateY(10px); box-shadow: inset 0 7px 13px rgba(255,255,255,.16), inset 0 -10px 20px rgba(75,0,0,.6), 0 3px 0 #5b0906, 0 9px 16px rgba(0,0,0,.75); }
.button:focus-visible { outline: 3px solid #fff; outline-offset: 8px; }
.button:disabled { cursor: not-allowed; filter: grayscale(.78) brightness(.54); box-shadow: inset 0 5px 14px rgba(255,255,255,.08), inset 0 -14px 24px rgba(0,0,0,.75), 0 8px 0 #222, 0 14px 22px rgba(0,0,0,.62); }
.copy { font: 900 23px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .14em; text-shadow: 0 1px 2px rgba(0,0,0,.7); }
.glare { position: absolute; width: 82px; height: 34px; border-radius: 50%; background: rgba(255,255,255,.1); filter: blur(7px); top: 22px; left: 47px; transform: rotate(-8deg); }

@media (max-width: 900px) {
  .stage { width: 310px; height: 310px; }
  .plinth { width: 214px; height: 214px; }
  .button { width: 150px; height: 150px; }
}
@media (max-width: 640px) {
  .stage { width: 285px; height: 285px; }
  .dial::before { opacity: .2; }
  .plinth { width: 190px; height: 190px; }
  .button { width: 132px; height: 132px; }
  .copy { font-size: 18px; }
}
```

- [ ] **Step 4: Write `web/src/components/press/PressButton.tsx`**

```tsx
import styles from "./PressButton.module.css";

export default function PressButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <div className={styles.stage}>
      <div className={styles.dial} aria-hidden="true" />
      <div className={styles.plinth}>
        <button type="button" className={styles.button} disabled={disabled} onClick={onPress} aria-label="Press the Button once forever">
          <span className={styles.glare} />
          <span className={styles.copy}>{label}</span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write `web/src/components/press/PressStatusLine.module.css`** (ported from `web/styles.css:132-134,202-208`)

```css
.kicker { display: flex; gap: 11px; color: #a29f98; font-size: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; text-transform: uppercase; letter-spacing: .12em; }
.kicker .arrow { color: var(--red); }
.rule { margin-top: 4px; font-weight: 650; letter-spacing: .025em; font-size: 14px; }
.rule strong { color: var(--red); }
.identity { margin-top: 12px; font-size: 10px; color: #8c8982; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; text-transform: uppercase; letter-spacing: .12em; }
.txStatus { min-height: 22px; margin-top: 13px; color: #dbd8d0; font-size: 10px; }
.postPress { margin-top: 10px; border: 1px solid var(--line); background: #0e0e0e; padding: 14px 16px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: center; }
.postPress strong { font: 800 12px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; }
.postPress button, .postPress a { border: 1px solid #3a3a3a; background: #171717; color: #ddd; padding: 8px 10px; font: 700 9px ui-monospace, SFMono-Regular, Menlo, monospace; cursor: pointer; }

@media (max-width: 640px) {
  .kicker { font-size: 8px; }
}
```

- [ ] **Step 6: Write `web/src/components/press/PressStatusLine.tsx`** (ported from `web/app.js`'s `renderIdentity`/`renderPostPress`, `web/app.js:269-327`)

```tsx
import { FACTIONS } from "../../domain/factions";
import { txUrl } from "../../config/network";
import { runtimeConfig } from "../../config/runtimeConfig";
import styles from "./PressStatusLine.module.css";

export interface IdentityInfo {
  connected: boolean;
  loaded: boolean;
  hasPressed: boolean;
  faction: number;
  remaining: number;
  txHash: string;
}

export default function PressStatusLine({ identity, txStatus }: { identity: IdentityInfo; txStatus: string }) {
  let identityLine = "YOU ARE GREY · YOU HAVE NOT PRESSED";
  let identityColor = FACTIONS[0].color;

  if (!runtimeConfig.previewMode && !identity.connected) {
    identityLine = "CONNECT A WALLET TO REVEAL YOUR STATUS";
    identityColor = "";
  } else if (!runtimeConfig.previewMode && identity.connected && !identity.loaded) {
    identityLine = "READING YOUR ONCHAIN STATUS…";
    identityColor = "";
  } else if (identity.hasPressed) {
    const f = FACTIONS[identity.faction];
    identityLine = `YOU ARE ${f.name} · YOUR ONE PRESS IS SPENT`;
    identityColor = f.color;
  }

  const share = identity.hasPressed
    ? `I pressed BUTTON at ${identity.remaining} seconds. ${FACTIONS[identity.faction].name}. One press forever. $BUTTON / RDDT`
    : "";

  return (
    <>
      <div className={styles.kicker}>
        <span>REDDIT, 2015</span>
        <span className={styles.arrow}>→</span>
        <span>ROBINHOOD CHAIN, 2026</span>
      </div>
      <div className={styles.rule}>
        ONE WALLET. ONE PRESS. <strong>FOREVER.</strong>
      </div>
      <div className={styles.identity} style={identityColor ? { color: identityColor } : undefined}>
        {identityLine}
      </div>
      <div className={styles.txStatus} aria-live="polite">{txStatus}</div>
      {identity.hasPressed && (
        <div className={styles.postPress}>
          <strong style={{ color: FACTIONS[identity.faction].color }}>
            YOU PRESSED AT {String(identity.remaining).padStart(2, "0")}s — {FACTIONS[identity.faction].name}
          </strong>
          {identity.txHash && (
            <a href={txUrl(runtimeConfig.network.explorer, identity.txHash)} target="_blank" rel="noopener noreferrer">
              TX ↗
            </a>
          )}
          <button type="button" onClick={() => navigator.clipboard?.writeText(share).catch(() => {})}>
            COPY
          </button>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(share)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            SHARE ON X ↗
          </a>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 7: Write `web/src/components/press/PressStage.module.css`** (ported from `web/styles.css:102-126`)

```css
.hero {
  min-height: 820px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 52px 16px 70px;
  position: relative;
  border-left: 1px solid var(--line);
  border-right: 1px solid var(--line);
  overflow: hidden;
}
.hero::before {
  content: "";
  position: absolute;
  width: 760px;
  height: 760px;
  border: 1px solid #202020;
  border-radius: 50%;
  top: 130px;
  left: 50%;
  transform: translateX(-50%);
  box-shadow: inset 0 0 120px rgba(255,255,255,.02);
  pointer-events: none;
}

@media (max-width: 900px) {
  .hero { min-height: 760px; padding-top: 38px; }
  .hero::before { width: 580px; height: 580px; }
}
@media (max-width: 640px) {
  .hero { padding-left: 8px; padding-right: 8px; min-height: 700px; }
}
```

- [ ] **Step 8: Write `web/src/components/press/PressStage.tsx`** (composes all press-flow hooks and wagmi write/receipt hooks; ported from `web/app.js`'s `press()`, `renderCore`'s button-label logic, and `updateTimer`'s sealed/live branching — `web/app.js:328-400,637-676`)

```tsx
import { useEffect, useMemo, useState } from "react";
import { useAccount, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import StatusPill from "../common/StatusPill";
import CountdownDisplay from "./CountdownDisplay";
import PressButton from "./PressButton";
import PressStatusLine from "./PressStatusLine";
import { useExperimentState } from "../../hooks/useExperimentState";
import { usePressFeed } from "../../hooks/usePressFeed";
import { useUserPress } from "../../hooks/useUserPress";
import { useCountdown } from "../../hooks/useCountdown";
import { usePreviewClock } from "../../hooks/usePreviewClock";
import { buttonExperimentAbi } from "../../abi/buttonExperiment";
import { runtimeConfig } from "../../config/runtimeConfig";
import styles from "./PressStage.module.css";

export default function PressStage() {
  const state = useExperimentState();
  const feed = usePressFeed(state);
  const userPress = useUserPress();
  const preview = usePreviewClock();
  const { address, isConnected, chainId, connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [txStatus, setTxStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const receipt = useWaitForTransactionReceipt({ hash: txHash });

  const wrongNetwork = !runtimeConfig.previewMode && isConnected && chainId !== runtimeConfig.network.chainId;

  const deadlineMs = runtimeConfig.previewMode ? preview.deadlineMs : state.loaded ? state.deadline * 1000 - state.chainOffsetMs : null;
  const sealed = runtimeConfig.previewMode ? false : !state.started;
  const alive = runtimeConfig.previewMode ? !preview.ended : state.started && state.alive;
  const reading = useCountdown(deadlineMs, { sealed, alive });
  const previewEnded = runtimeConfig.previewMode && reading.remainingMs === 0 && preview.deadlineMs <= Date.now();

  const deadlineLabel = runtimeConfig.previewMode
    ? previewEnded
      ? "LOCAL PREVIEW HAS EXPIRED"
      : "LOCAL DEMO · NO BLOCKCHAIN STATE"
    : !state.started
      ? "AWAITING ONE-TIME ACTIVATION"
      : state.alive
        ? `DEADLINE · ${new Date(state.deadline * 1000).toLocaleTimeString([], { hour12: false })}`
        : `ENDED · ${new Date(state.deadline * 1000).toLocaleString()}`;

  const statusLabel = runtimeConfig.previewMode
    ? previewEnded
      ? "PREVIEW ENDED · NOT ONCHAIN"
      : "PREVIEW CLOCK RUNNING · NOT ONCHAIN"
    : !state.loaded
      ? "LOADING SHARED STATE"
      : state.stale
        ? "RPC STALE · SHOWING LAST KNOWN STATE"
        : !state.started
          ? "THE BUTTON IS SEALED"
          : state.alive
            ? "EXPERIMENT LIVE · SHARED CLOCK RUNNING"
            : "EXPERIMENT ENDED · HISTORY FROZEN";

  const statusTone = runtimeConfig.previewMode
    ? previewEnded ? "dead" : "stale"
    : !state.loaded
      ? ""
      : state.stale
        ? "stale"
        : !state.started
          ? ""
          : state.alive
            ? "live"
            : "dead";

  const already = !runtimeConfig.previewMode && Boolean(address) && userPress.loaded && userPress.hasPressed;

  const buttonLabel = runtimeConfig.previewMode
    ? previewEnded ? "ENDED" : preview.pressed ? "SPENT" : "PRESS"
    : !state.loaded
      ? "WAIT"
      : !state.started
        ? "SEALED"
        : !state.alive
          ? "ENDED"
          : already
            ? "SPENT"
            : state.stale
              ? "STALE"
              : pending
                ? "PENDING"
                : wrongNetwork
                  ? "SWITCH"
                  : "PRESS";

  const buttonDisabled = runtimeConfig.previewMode
    ? previewEnded || preview.pressed
    : !state.loaded || !state.started || !state.alive || already || state.stale || pending;

  useEffect(() => {
    if (!receipt.data) return;
    if (receipt.data.status !== "success") {
      setTxStatus("PRESS FAILED · Transaction reverted. The clock may have expired or your wallet had already pressed.");
      setPending(false);
      return;
    }
    setTxStatus("CONFIRMED ON ROBINHOOD CHAIN · YOUR PRESS IS PERMANENT");
    setPending(false);
  }, [receipt.data]);

  async function handlePress() {
    if (runtimeConfig.previewMode) {
      preview.press();
      setTxStatus("PREVIEW PRESS RECORDED LOCALLY · NO TRANSACTION WAS SENT");
      return;
    }
    if (!state.started || !state.alive || state.stale) return;
    if (!isConnected || !address) {
      setTxStatus("NO WALLET CONNECTED · USE THE CONNECT WALLET BUTTON ABOVE");
      return;
    }
    if (already) return;

    try {
      if (wrongNetwork) {
        setTxStatus(`SWITCHING TO ${runtimeConfig.network.name.toUpperCase()}…`);
        await switchChainAsync({ chainId: runtimeConfig.network.chainId });
        return;
      }
      setTxStatus("AWAITING YOUR ONE IRREVERSIBLE PRESS IN WALLET…");
      setPending(true);
      const hash = await writeContractAsync({
        address: runtimeConfig.contractAddress as `0x${string}`,
        abi: buttonExperimentAbi,
        functionName: "press",
        account: address,
        connector
      });
      setTxHash(hash);
      setTxStatus(`SUBMITTED · CONFIRMING…`);
    } catch (error: unknown) {
      const err = error as { code?: number; cause?: { code?: number }; message?: string };
      const rejected = err?.code === 4001 || err?.cause?.code === 4001;
      setTxStatus(
        rejected
          ? "PRESS REJECTED IN WALLET · YOUR ONE PRESS IS STILL UNUSED"
          : `PRESS FAILED · ${err?.message || "STATE CHANGED BEFORE CONFIRMATION"}`
      );
      setPending(false);
    }
  }

  const identity = useMemo(
    () =>
      runtimeConfig.previewMode
        ? { connected: true, loaded: true, hasPressed: preview.pressed, faction: preview.faction, remaining: preview.remaining, txHash: "" }
        : { connected: Boolean(address), loaded: userPress.loaded, hasPressed: userPress.hasPressed, faction: userPress.faction, remaining: userPress.remaining, txHash: txHash || "" },
    [address, userPress, preview.pressed, preview.faction, preview.remaining, txHash]
  );

  return (
    <section className={styles.hero} id="experiment">
      <StatusPill label={statusLabel} tone={statusTone as "" | "live" | "dead" | "stale"} />
      <CountdownDisplay reading={reading} deadlineLabel={deadlineLabel} pulseKey={feed.latestKey} />
      <PressButton label={buttonLabel} disabled={buttonDisabled} onPress={handlePress} />
      <PressStatusLine identity={identity} txStatus={txStatus} />
    </section>
  );
}
```

- [ ] **Step 9: Verify typecheck, lint, and build**

Run: `cd web && npm run typecheck && npm run lint && npm run build`
Expected: all three exit 0. Fix any `noUnusedLocals`/`react-hooks/exhaustive-deps` warnings that surface (e.g. remove the unused `addressUrl` import noted in Step 6 if lint flags it).

- [ ] **Step 10: Commit**

```bash
git add web/src/components/press
git commit -m "feat(web): add press stage components (countdown, button, status, press flow)"
```

---

## Task 12: Feed components

**Files:**
- Create: `web/src/components/feed/FeedRow.tsx` + `.module.css`
- Create: `web/src/components/feed/FeedSkeleton.tsx`
- Create: `web/src/components/feed/FeedEmptyState.tsx` + `.module.css`
- Create: `web/src/components/feed/LivePressFeed.tsx` + `.module.css`

**Interfaces:**
- Consumes: `PressFeed` (Task 7's return type), `PressEvent` (Task 2), `shortAddress`/`relativeTime` (Task 2), `FACTIONS` (Task 2), `txUrl` (Task 2 `network.ts`), `Skeleton` (Task 10).
- Produces: `<LivePressFeed feed={feed} />` — consumed by `App.tsx` (Task 14) for the left column.

- [ ] **Step 1: Write `web/src/components/feed/FeedRow.module.css`** (ported from `web/styles.css:216-227`)

```css
.row {
  min-height: 58px;
  display: grid;
  grid-template-columns: 82px 1.2fr 110px 110px 1fr 34px;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #242424;
  font: 650 11px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.row.flash { animation: flash 1.1s ease; }
@keyframes flash { 0% { background: rgba(239,43,36,.22); } 100% { background: transparent; } }
.no { color: #65625d; }
.wallet { color: #dedbd4; }
.seconds { font-size: 14px; }
.ago { color: #77736d; text-align: right; }
.link { text-align: right; color: #73706a; }
.chip { display: inline-flex; align-items: center; gap: 7px; font-size: 9px; letter-spacing: .08em; }
.chip::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--chip); }

@media (max-width: 640px) {
  .row { grid-template-columns: 52px 1fr 70px 82px; font-size: 9px; }
  .ago, .link { display: none; }
}
```

- [ ] **Step 2: Write `web/src/components/feed/FeedRow.tsx`**

```tsx
import { useEffect, useState } from "react";
import { FACTIONS } from "../../domain/factions";
import { relativeTime, shortAddress } from "../../domain/format";
import { txUrl } from "../../config/network";
import { runtimeConfig } from "../../config/runtimeConfig";
import type { PressEvent } from "../../domain/types";
import styles from "./FeedRow.module.css";

export default function FeedRow({ event, isNew }: { event: PressEvent; isNew: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const faction = FACTIONS[event.faction] ?? FACTIONS[0];

  return (
    <div className={`${styles.row} ${isNew ? styles.flash : ""}`}>
      <span className={styles.no}>#{event.pressNumber}</span>
      <span className={styles.wallet}>{shortAddress(event.presser)}</span>
      <span className={styles.seconds}>{event.remaining}s</span>
      <span className={styles.chip} style={{ ["--chip" as string]: faction.color }}>
        {faction.name}
      </span>
      <span className={styles.ago}>{relativeTime(event.timestamp, now)}</span>
      {event.txHash ? (
        <a
          className={styles.link}
          href={txUrl(runtimeConfig.network.explorer, event.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View press transaction"
        >
          ↗
        </a>
      ) : (
        <span />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `web/src/components/feed/FeedSkeleton.tsx`**

```tsx
import Skeleton from "../common/Skeleton";

export default function FeedSkeleton() {
  return (
    <div style={{ display: "grid", gap: 10, padding: "16px 0" }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} height={40} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write `web/src/components/feed/FeedEmptyState.module.css`** (ported from `web/styles.css:225`)

```css
.empty {
  padding: 30px 0;
  color: #6f6c65;
  font: 11px ui-monospace, SFMono-Regular, Menlo, monospace;
  text-transform: uppercase;
  letter-spacing: .08em;
}
```

- [ ] **Step 5: Write `web/src/components/feed/FeedEmptyState.tsx`**

```tsx
import styles from "./FeedEmptyState.module.css";

export default function FeedEmptyState() {
  return <div className={styles.empty}>No presses indexed yet.</div>;
}
```

- [ ] **Step 6: Write `web/src/components/feed/LivePressFeed.module.css`** (ported from `web/styles.css:210-216`)

```css
.section { border: 1px solid var(--line); border-top: 0; padding: 58px 48px; }
.head { display: flex; justify-content: space-between; gap: 30px; align-items: end; margin-bottom: 30px; }
.head h2 { margin: 6px 0 0; font-size: clamp(28px,4vw,54px); letter-spacing: -.05em; line-height: .95; }
.eyebrow { color: var(--red); font-size: 9px; font-weight: 800; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; text-transform: uppercase; letter-spacing: .12em; }
.freshness { color: #77746e; font-size: 9px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; text-transform: uppercase; letter-spacing: .12em; }
.tape { border-top: 1px solid #343434; }

@media (max-width: 640px) {
  .section { padding: 40px 18px; }
  .head { align-items: start; flex-direction: column; gap: 12px; }
}
```

- [ ] **Step 7: Write `web/src/components/feed/LivePressFeed.tsx`** (ported from `web/app.js`'s `renderTape`, `web/app.js:249-268`)

```tsx
import { runtimeConfig } from "../../config/runtimeConfig";
import type { PressFeed } from "../../hooks/usePressFeed";
import type { PreviewClockState } from "../../hooks/usePreviewClock";
import FeedRow from "./FeedRow";
import FeedSkeleton from "./FeedSkeleton";
import FeedEmptyState from "./FeedEmptyState";
import styles from "./LivePressFeed.module.css";

export default function LivePressFeed({ feed, preview }: { feed: PressFeed; preview: PreviewClockState | null }) {
  const events = runtimeConfig.previewMode ? preview!.events : feed.events;
  const freshness = runtimeConfig.previewMode ? "PREVIEW" : feed.freshness;
  const loading = !runtimeConfig.previewMode && feed.freshness === "SYNCING" && events.length === 0;

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <div>
          <span className={styles.eyebrow}>LIVE TAPE</span>
          <h2>Every press leaves a mark.</h2>
        </div>
        <span className={styles.freshness}>{freshness}</span>
      </div>
      <div className={styles.tape}>
        {loading ? (
          <FeedSkeleton />
        ) : events.length === 0 ? (
          <FeedEmptyState />
        ) : (
          events.slice(0, 14).map((event, idx) => <FeedRow key={event.key} event={event} isNew={idx === 0} />)
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Verify typecheck, lint, and build**

Run: `cd web && npm run typecheck && npm run lint && npm run build`
Expected: all three exit 0.

- [ ] **Step 9: Commit**

```bash
git add web/src/components/feed
git commit -m "feat(web): add live press feed components"
```

---

## Task 13: Stats, token, and identity components

**Files:**
- Create: `web/src/components/stats/StatTile.tsx` + `.module.css`
- Create: `web/src/components/stats/FactionBars.tsx` + `.module.css`
- Create: `web/src/components/stats/StatsPanel.tsx`
- Create: `web/src/components/token/TokenPanel.tsx` + `.module.css`
- Create: `web/src/components/identity/IdentityPanel.tsx` + `.module.css`

**Interfaces:**
- Consumes: `ExperimentState`, `PressFeed`/`PreviewClockState`, `useStreak` (Task 8), `FACTIONS`, `formatDuration`/`shortAddress` (Task 2), `runtimeConfig`.
- Produces: `<StatsPanel state feed preview />`, `<TokenPanel />`, `<IdentityPanel identity />` — consumed by `App.tsx` (Task 14).

- [ ] **Step 1: Write `web/src/components/stats/StatTile.module.css`** (ported from `web/styles.css:229-234,289-291,321-323`)

```css
.tile { min-height: 180px; padding: 32px; border-right: 1px solid var(--line); display: flex; flex-direction: column; justify-content: space-between; }
.tile span, .tile small { color: #77736d; font: 750 9px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .1em; }
.tile strong { font: 780 clamp(27px,3vw,44px) ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: -.06em; }
.tile small { letter-spacing: 0; text-transform: lowercase; }
```

- [ ] **Step 2: Write `web/src/components/stats/StatTile.tsx`**

```tsx
import styles from "./StatTile.module.css";

export default function StatTile({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <article className={styles.tile}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </article>
  );
}
```

- [ ] **Step 3: Write `web/src/components/stats/FactionBars.module.css`** (ported from `web/styles.css:236-243,324-325`)

```css
.list { display: grid; gap: 1px; background: #222; border: 1px solid #2a2a2a; }
.row { display: grid; grid-template-columns: 18px 130px 110px 1fr 90px; gap: 18px; align-items: center; min-height: 68px; background: #101010; padding: 0 20px; }
.swatch { width: 10px; height: 42px; background: var(--fc); }
.name { font: 800 12px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .09em; }
.range, .count { color: #8a8780; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
.bar { height: 6px; background: #262626; overflow: hidden; }
.bar > i { display: block; height: 100%; width: var(--pct); background: var(--fc); }
.count { text-align: right; }

@media (max-width: 640px) {
  .row { grid-template-columns: 12px 92px 70px 1fr; padding: 0 10px; gap: 8px; }
  .count { display: none; }
}
```

- [ ] **Step 4: Write `web/src/components/stats/FactionBars.tsx`** (ported from `web/app.js`'s `renderFactionList`, `web/app.js:234-248`)

```tsx
import { FACTIONS } from "../../domain/factions";
import styles from "./FactionBars.module.css";

export default function FactionBars({ counts, total }: { counts: readonly number[]; total: number }) {
  return (
    <div className={styles.list}>
      {[1, 2, 3, 4, 5, 6].map((i) => {
        const f = FACTIONS[i];
        const count = counts[i] || 0;
        const pct = total ? (count / total) * 100 : 0;
        return (
          <div key={i} className={styles.row} style={{ ["--fc" as string]: f.color }}>
            <span className={styles.swatch} />
            <span className={styles.name}>{f.name}</span>
            <span className={styles.range}>{f.range}</span>
            <span className={styles.bar} aria-label={`${f.name} ${pct.toFixed(1)} percent`}>
              <i style={{ ["--pct" as string]: `${pct.toFixed(2)}%` }} />
            </span>
            <span className={styles.count}>
              {count} · {pct.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Write `web/src/components/stats/StatsPanel.tsx`** (ported from `web/app.js`'s stats-grid fields + new "current streak" tile)

```tsx
import { formatDuration, shortAddress } from "../../domain/format";
import { runtimeConfig } from "../../config/runtimeConfig";
import { useStreak } from "../../hooks/useStreak";
import type { ExperimentState, PressEvent } from "../../domain/types";
import type { PreviewClockState } from "../../hooks/usePreviewClock";
import StatTile from "./StatTile";
import FactionBars from "./FactionBars";

export default function StatsPanel({
  state,
  events,
  preview
}: {
  state: ExperimentState;
  events: PressEvent[];
  preview: PreviewClockState | null;
}) {
  const total = runtimeConfig.previewMode ? preview!.total : state.totalPresses;
  const closest = runtimeConfig.previewMode ? preview!.closest : state.closestCall;
  const counts = runtimeConfig.previewMode ? preview!.factionCounts : state.factionCounts;
  const streak = useStreak(events);
  const latestPresser = events[0]?.presser;

  const ageSeconds = runtimeConfig.previewMode
    ? (Math.min(Date.now(), preview!.deadlineMs) - preview!.startedAtMs) / 1000
    : state.started
      ? Math.max(0, (state.alive ? Date.now() + state.chainOffsetMs : state.deadline * 1000) / 1000 - state.startedAt)
      : NaN;

  return (
    <section id="stats" aria-label="Experiment stats">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderLeft: "1px solid var(--line)", borderRight: "1px solid var(--line)" }}>
        <StatTile label="TOTAL PRESSES" value={total ? total.toLocaleString() : "—"} caption="one wallet = one press" />
        <StatTile label="EXPERIMENT UPTIME" value={Number.isFinite(ageSeconds) ? formatDuration(ageSeconds) : "—"} caption="since activation" />
        <StatTile label="CLOSEST CALL" value={total ? `${closest}s` : "—"} caption="lowest clock at press" />
        <StatTile label="CURRENT STREAK" value={streak ? String(streak) : "—"} caption="consecutive same-faction presses" />
      </div>
      <div style={{ marginTop: 1 }}>
        <StatTile label="LATEST PRESSER" value={latestPresser ? shortAddress(latestPresser) : "—"} caption="most recent wallet" />
      </div>
      <FactionBars counts={counts} total={total} />
    </section>
  );
}
```

- [ ] **Step 6: Write `web/src/components/token/TokenPanel.module.css`** (ported from `web/styles.css:253-259,295-296`)

```css
.section { border: 1px solid var(--line); border-top: 0; padding: 58px 48px; display: grid; grid-template-columns: 1.25fr .75fr; gap: 60px; align-items: center; }
.copy h2 { font-size: clamp(38px,6vw,78px); line-height: .9; letter-spacing: -.07em; margin: 14px 0 28px; }
.copy > p { color: #aaa69e; max-width: 720px; font-size: 17px; line-height: 1.55; }
.disclaimer { color: #6f6c66; font-size: 12px; }
.link { display: inline-flex; margin-top: 18px; border-bottom: 1px solid #777; padding-bottom: 5px; font: 800 10px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; }
.art { border: 1px solid #2b2b2b; background: #0c0c0c; padding: 12px; transform: rotate(1.2deg); }
.art img { width: 100%; display: block; filter: saturate(.86) contrast(1.04); }
.eyebrow { color: var(--red); font-size: 9px; font-weight: 800; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; text-transform: uppercase; letter-spacing: .12em; }

@media (max-width: 900px) {
  .section { grid-template-columns: 1fr; }
  .art { max-width: 430px; }
}
```

- [ ] **Step 7: Write `web/src/components/token/TokenPanel.tsx`** (ported from `web/app.js`'s token-link handling, `web/app.js:679-682`)

```tsx
import { runtimeConfig } from "../../config/runtimeConfig";
import styles from "./TokenPanel.module.css";

export default function TokenPanel() {
  return (
    <section className={styles.section} id="lore">
      <div className={styles.copy}>
        <span className={styles.eyebrow}>BUTTON / RDDT</span>
        <h2>
          THE TOKEN IS THE RECEIPT.
          <br />
          THE BUTTON IS THE EXPERIMENT.
        </h2>
        <p>
          In 2015, Reddit gave the internet a 60-second timer and one irreversible press. More than a million people
          turned a button into factions, rituals and panic. BUTTON brings the same primitive onchain: one wallet,
          one press, one shared clock.
        </p>
        <p className={styles.disclaimer}>The token does not change your access, odds or result in the experiment.</p>
        {runtimeConfig.tokenUrl && (
          <a className={styles.link} href={runtimeConfig.tokenUrl} target="_blank" rel="noopener noreferrer">
            VIEW TOKEN ↗
          </a>
        )}
      </div>
      <div className={styles.art}>
        <img src="/assets/button-token.png" alt="BUTTON token artwork: a red button and countdown" />
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Write `web/src/components/identity/IdentityPanel.module.css`**

```css
.panel { border: 1px solid var(--line); border-top: 0; padding: 32px 48px; display: grid; grid-template-columns: repeat(4,1fr); gap: 18px; }
.panel span { display: block; color: #77736d; font: 750 9px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .1em; margin-bottom: 6px; }
.panel strong { font: 800 13px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: -.02em; }

@media (max-width: 640px) {
  .panel { grid-template-columns: 1fr 1fr; padding: 24px 18px; }
}
```

- [ ] **Step 9: Write `web/src/components/identity/IdentityPanel.tsx`** (new component, self-sufficient — reads its own wallet/press state via wagmi and `useUserPress` rather than receiving it as a prop, since it needs to render independently of `PressStage`'s internal state; see design spec section 5, "Lower-right")

```tsx
import { useAccount } from "wagmi";
import { FACTIONS } from "../../domain/factions";
import { shortAddress } from "../../domain/format";
import { runtimeConfig } from "../../config/runtimeConfig";
import { useUserPress } from "../../hooks/useUserPress";
import type { PreviewClockState } from "../../hooks/usePreviewClock";
import styles from "./IdentityPanel.module.css";

export default function IdentityPanel({ preview }: { preview: PreviewClockState }) {
  const { address } = useAccount();
  const userPress = useUserPress();

  const hasPressed = runtimeConfig.previewMode ? preview.pressed : userPress.hasPressed;
  const factionId = runtimeConfig.previewMode ? preview.faction : userPress.faction;
  const remaining = runtimeConfig.previewMode ? preview.remaining : userPress.remaining;
  const loaded = runtimeConfig.previewMode || userPress.loaded;
  const connected = runtimeConfig.previewMode || Boolean(address);
  const faction = FACTIONS[factionId] ?? FACTIONS[0];

  const status = !connected ? "DISCONNECTED" : !loaded ? "READING…" : hasPressed ? "SPENT" : "UNSPENT";

  return (
    <div className={styles.panel} aria-label="Your identity">
      <div>
        <span>WALLET</span>
        <strong>{address ? shortAddress(address) : runtimeConfig.previewMode ? "PREVIEW" : "—"}</strong>
      </div>
      <div>
        <span>PRESSED AT</span>
        <strong>{hasPressed ? `${remaining}s` : "—"}</strong>
      </div>
      <div>
        <span>FACTION</span>
        <strong style={{ color: hasPressed ? faction.color : undefined }}>{hasPressed ? faction.name : "GREY"}</strong>
      </div>
      <div>
        <span>STATUS</span>
        <strong>{status}</strong>
      </div>
    </div>
  );
}
```

This polls `useUserPress()` on its own 2500ms interval, independent of `PressStage`'s identical read — a small, intentional YAGNI tradeoff. Sharing it would mean lifting wallet-derived state up through `App.tsx` and prop-drilling it back down for a single cheap read; two independent `setInterval` calls on the same fast RPC read cost far less than that indirection.

- [ ] **Step 10: Verify typecheck, lint, and build**

Run: `cd web && npm run typecheck && npm run lint && npm run build`
Expected: all three exit 0.

- [ ] **Step 11: Commit**

```bash
git add web/src/components/stats web/src/components/token web/src/components/identity
git commit -m "feat(web): add stats, token and identity panel components"
```

---

## Task 14: Content sections + full App composition

**Files:**
- Create: `web/src/components/rules/RulesSection.tsx` + `.module.css`
- Create: `web/src/components/rules/ProofSection.tsx` + `.module.css`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: everything from Tasks 6–13.
- Produces: the fully composed page. `App.tsx` becomes the single place that instantiates `useExperimentState`, `usePressFeed`, and `usePreviewClock` **once** and passes the results down as props (rather than each component re-subscribing independently), matching "reusable components... rather than one giant page component" while avoiding duplicate polling.

**Design note — lifting shared state up:** `PressStage` (Task 11) currently calls `useExperimentState`/`usePressFeed`/`usePreviewClock` itself for self-containment during earlier tasks' verification. In this task, hoist those three hook calls into `App.tsx` and pass the results into `PressStage`, `LivePressFeed`, `StatsPanel`, and `SystemStrip` as props, so the app only polls once per interval instead of once per consuming component. `IdentityPanel` (Task 13) is already self-sufficient (reads its own wallet/press state) and needs no change here. Update `PressStage`'s signature to accept `state`, `feed`, and `preview` as props instead of calling those three hooks internally — its own `useUserPress`, `useCountdown`, `useAccount`, `useSwitchChain`, `useWriteContract`, `useWaitForTransactionReceipt`, and the inline `identity` computation stay exactly as written in Task 11, untouched.

- [ ] **Step 1: Refactor `web/src/components/press/PressStage.tsx` to accept shared state as props**

Change the function signature:

```tsx
// Replace this line:
export default function PressStage() {
// with:
export default function PressStage({
  state,
  feed,
  preview
}: {
  state: ExperimentState;
  feed: PressFeed;
  preview: PreviewClockState;
}) {
```

Remove these three lines from the top of the function body (they move to `App.tsx`):

```tsx
  const state = useExperimentState();
  const feed = usePressFeed(state);
  const preview = usePreviewClock();
```

Remove the now-unused imports `useExperimentState`, `usePressFeed`, `usePreviewClock` and add type-only imports instead:

```tsx
import type { ExperimentState } from "../../domain/types";
import type { PressFeed } from "../../hooks/usePressFeed";
import type { PreviewClockState } from "../../hooks/usePreviewClock";
```

Everything else in the file — the `useUserPress`, `useAccount`, `useSwitchChain`, `useWriteContract`, `useWaitForTransactionReceipt` calls, the `useCountdown` call, `handlePress`, and the inline `identity` `useMemo` — stays exactly as written in Task 11 Step 8.

- [ ] **Step 2: Write `web/src/components/rules/RulesSection.module.css`** (ported from `web/styles.css:245-251,292-294,326-329`)

```css
.grid { display: grid; grid-template-columns: repeat(4,1fr); border: 1px solid #292929; }
.grid article { min-height: 250px; padding: 26px; border-right: 1px solid #292929; }
.grid article:last-child { border-right: 0; }
.grid b { color: var(--red); font: 800 10px ui-monospace, SFMono-Regular, Menlo, monospace; }
.grid h3 { margin: 72px 0 10px; font-size: 20px; line-height: 1.05; letter-spacing: -.035em; }
.grid p { color: #8a8780; font-size: 13px; line-height: 1.55; margin: 0; }
.fineprint { margin: 20px 0 0; color: #6e6b65; font-size: 11px; padding: 0 48px 40px; }
.head { padding: 58px 48px 0; }
.head h2 { margin: 6px 0 0; font-size: clamp(28px,4vw,54px); letter-spacing: -.05em; line-height: .95; }
.eyebrow { color: var(--red); font-size: 9px; font-weight: 800; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; text-transform: uppercase; letter-spacing: .12em; }

@media (max-width: 900px) {
  .grid { grid-template-columns: 1fr 1fr; }
  .grid article:nth-child(2) { border-right: 0; }
  .grid article:nth-child(-n+2) { border-bottom: 1px solid #292929; }
}
@media (max-width: 640px) {
  .grid { grid-template-columns: 1fr; }
  .grid article { min-height: 195px; border-right: 0; border-bottom: 1px solid #292929; }
  .grid article:last-child { border-bottom: 0; }
  .grid h3 { margin-top: 42px; }
  .head, .fineprint { padding-left: 18px; padding-right: 18px; }
}
```

- [ ] **Step 3: Write `web/src/components/rules/RulesSection.tsx`** (ported verbatim copy from `web/index.html`'s `#rules` section)

```tsx
import styles from "./RulesSection.module.css";

const RULES = [
  { n: "01", title: "One wallet gets one press.", body: "The contract remembers. Switching browsers changes nothing." },
  { n: "02", title: "A press resets the clock to 60.", body: "Your transaction buys nobody anything. It only changes shared time." },
  { n: "03", title: "At zero, it ends forever.", body: "If nobody reaches the chain before the deadline, the experiment is over." },
  { n: "04", title: "The contract cannot rescue you.", body: "After activation there is no admin reset, extension, fee switch or upgrade." }
];

export default function RulesSection() {
  return (
    <section id="rules">
      <div className={styles.head}>
        <span className={styles.eyebrow}>THE RULES</span>
        <h2>Four lines. No rescue clause.</h2>
      </div>
      <div className={styles.grid}>
        {RULES.map((rule) => (
          <article key={rule.n}>
            <b>{rule.n}</b>
            <h3>{rule.title}</h3>
            <p>{rule.body}</p>
          </article>
        ))}
      </div>
      <p className={styles.fineprint}>Gas is paid in ETH on Robinhood Chain. BUTTON ownership is not required to participate.</p>
    </section>
  );
}
```

- [ ] **Step 4: Write `web/src/components/rules/ProofSection.module.css`** (ported from `web/styles.css:261-266,297-301,331-333`)

```css
.section { border: 1px solid var(--line); border-top: 0; padding: 58px 48px; }
.head { margin-bottom: 30px; }
.head h2 { margin: 6px 0 0; font-size: clamp(28px,4vw,54px); letter-spacing: -.05em; line-height: .95; }
.eyebrow { color: var(--red); font-size: 9px; font-weight: 800; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; text-transform: uppercase; letter-spacing: .12em; }
.grid { display: grid; grid-template-columns: repeat(3,1fr); border: 1px solid #282828; }
.grid > div { min-height: 96px; padding: 18px; border-right: 1px solid #282828; border-bottom: 1px solid #282828; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.grid > div:nth-child(3n) { border-right: 0; }
.grid > div:nth-last-child(-n+3) { border-bottom: 0; }
.grid code { color: #dedbd4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.link { display: inline-flex; margin-top: 18px; border-bottom: 1px solid #777; padding-bottom: 5px; font: 800 10px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; }

@media (max-width: 900px) {
  .grid { grid-template-columns: 1fr 1fr; }
  .grid > div:nth-child(3n) { border-right: 1px solid #282828; }
  .grid > div:nth-child(2n) { border-right: 0; }
  .grid > div:nth-last-child(-n+3) { border-bottom: 1px solid #282828; }
  .grid > div:nth-last-child(-n+2) { border-bottom: 0; }
}
@media (max-width: 640px) {
  .grid { grid-template-columns: 1fr; }
  .grid > div { border-right: 0 !important; border-bottom: 1px solid #282828 !important; }
  .grid > div:last-child { border-bottom: 0 !important; }
}
```

- [ ] **Step 5: Write `web/src/components/rules/ProofSection.tsx`** (ported from `web/app.js`'s proof-grid fields, `web/app.js:352-357,679-682`)

```tsx
import { runtimeConfig } from "../../config/runtimeConfig";
import { addressUrl } from "../../config/network";
import type { ExperimentState } from "../../domain/types";
import styles from "./ProofSection.module.css";

export default function ProofSection({ state }: { state: ExperimentState }) {
  return (
    <section className={styles.section} id="proof">
      <div className={styles.head}>
        <span className={styles.eyebrow}>PROOF</span>
        <h2>The UI can disappear. The rules remain.</h2>
      </div>
      <div className={styles.grid}>
        <div><span>NETWORK</span><code>{runtimeConfig.previewMode ? "PREVIEW / LOCAL" : runtimeConfig.network.name.toUpperCase()}</code></div>
        <div><span>CHAIN ID</span><code>{runtimeConfig.previewMode ? "—" : runtimeConfig.network.chainId}</code></div>
        <div><span>CONTRACT</span><code>{runtimeConfig.previewMode ? "NOT CONFIGURED" : runtimeConfig.contractAddress}</code></div>
        <div><span>DEPLOY BLOCK</span><code>{runtimeConfig.raw.contractDeployBlock || "—"}</code></div>
        <div><span>CURRENT BLOCK</span><code>{runtimeConfig.previewMode ? "—" : state.currentBlock || "—"}</code></div>
        <div><span>RPC</span><code>{runtimeConfig.previewMode ? "PREVIEW ONLY" : state.stale ? "STALE" : state.loaded ? "CONNECTED" : "CHECKING"}</code></div>
      </div>
      {!runtimeConfig.previewMode && (
        <a className={styles.link} href={addressUrl(runtimeConfig.network.explorer, runtimeConfig.contractAddress)} target="_blank" rel="noopener noreferrer">
          OPEN CONTRACT ON BLOCKSCOUT ↗
        </a>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Write the final `web/src/App.tsx`**

```tsx
import AppShell from "./components/layout/AppShell";
import SystemStrip from "./components/layout/SystemStrip";
import PressStage from "./components/press/PressStage";
import LivePressFeed from "./components/feed/LivePressFeed";
import StatsPanel from "./components/stats/StatsPanel";
import TokenPanel from "./components/token/TokenPanel";
import IdentityPanel from "./components/identity/IdentityPanel";
import RulesSection from "./components/rules/RulesSection";
import ProofSection from "./components/rules/ProofSection";
import { useExperimentState } from "./hooks/useExperimentState";
import { usePressFeed } from "./hooks/usePressFeed";
import { usePreviewClock } from "./hooks/usePreviewClock";
import { runtimeConfig } from "./config/runtimeConfig";

export default function App() {
  const state = useExperimentState();
  const feed = usePressFeed(state);
  const preview = usePreviewClock();
  const events = runtimeConfig.previewMode ? preview.events : feed.events;

  return (
    <AppShell footer={<SystemStrip state={state} />}>
      <PressStage state={state} feed={feed} preview={preview} />
      <LivePressFeed feed={feed} preview={runtimeConfig.previewMode ? preview : null} />
      <StatsPanel state={state} events={events} preview={runtimeConfig.previewMode ? preview : null} />
      <IdentityPanel preview={preview} />
      <TokenPanel />
      <RulesSection />
      <ProofSection state={state} />
    </AppShell>
  );
}
```

- [ ] **Step 7: Verify typecheck, lint, and build**

Run: `cd web && npm run typecheck && npm run lint && npm run build`
Expected: all three exit 0. Fix any unused-import or prop-mismatch errors that surface from the `PressStage` prop refactor in Step 1.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/rules web/src/components/press/PressStage.tsx web/src/App.tsx
git commit -m "feat(web): add rules/proof sections and compose full app with shared polling state"
```

---

## Task 15: Migration, deployment config, and final verification

**Files:**
- Modify: `web/vercel.json`
- Modify: `web/about/index.html`
- Move: `web/assets/button-token.png` → `web/public/assets/button-token.png`
- Delete: `web/app.js`, `web/styles.css`, `web/config.js`, `web/assets/` (old location)
- Modify: `README.md` (Local frontend preview + deploy sections)

**Interfaces:**
- No new interfaces — this task retires the old static files and confirms the new build's deployment story matches the old one exactly (per design spec section 3.2 and 10).

- [ ] **Step 1: Move the token image**

```bash
mkdir -p web/public/assets
git mv web/assets/button-token.png web/public/assets/button-token.png
```

- [ ] **Step 2: Update `web/vercel.json`** (add `outputDirectory`; headers config unchanged)

```json
{
  "outputDirectory": "dist",
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {"key": "X-Content-Type-Options", "value": "nosniff"},
        {"key": "Referrer-Policy", "value": "strict-origin-when-cross-origin"},
        {"key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()"}
      ]
    }
  ]
}
```

- [ ] **Step 3: Update `web/about/index.html`'s stylesheet reference**

The about page stays static HTML (per design spec section 10) but must use the new token/global styles instead of the deleted root `web/styles.css`. Since Vite only processes files referenced from `web/index.html` or imported from JS, `web/about/index.html` needs its own small standalone stylesheet. Create `web/about/about.css` containing only the rules the about page actually uses, ported from the deleted `web/styles.css`:

```css
:root {
  --bg: #080808; --ink: #f2efe8; --muted: #8e8b85; --line: #292929; --red: #ef2b24; --max: 1320px;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; background: var(--bg); }
body {
  margin: 0;
  background: linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px), var(--bg);
  background-size: 36px 36px;
  color: var(--ink);
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  min-height: 100vh;
}
a { color: inherit; text-decoration: none; }
.topbar { width: min(calc(100% - 32px), var(--max)); margin: 0 auto; min-height: 72px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; border-bottom: 1px solid var(--line); }
.brand { justify-self: start; display: inline-flex; gap: 8px; align-items: center; font-weight: 850; letter-spacing: -.03em; }
.brand span { color: var(--muted); font-weight: 600; }
.brand-dot { width: 11px; height: 11px; border-radius: 50%; background: var(--red); box-shadow: 0 0 16px rgba(239,43,36,.55); }
.topbar nav { display: flex; gap: 28px; color: #b9b6b0; font-size: 13px; justify-self: center; }
.topbar nav a:hover { color: #fff; }
.eyebrow { color: var(--red); font-size: 9px; font-weight: 800; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; text-transform: uppercase; letter-spacing: .12em; }
.about-main { width: min(calc(100% - 32px), var(--max)); margin: 0 auto; border-left: 1px solid var(--line); border-right: 1px solid var(--line); padding: 110px 7vw 100px; min-height: calc(100vh - 72px); }
.about-main h1 { font-size: clamp(70px,11vw,155px); max-width: 1050px; margin: 20px 0 36px; letter-spacing: -.085em; line-height: .78; }
.about-main .lede { max-width: 900px; font-size: clamp(20px,2.4vw,34px); line-height: 1.25; color: #b7b3ab; letter-spacing: -.025em; }
.about-rule { margin: 70px 0; padding: 24px; border-left: 4px solid var(--red); background: #101010; font-size: 19px; }
.about-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; border-top: 1px solid var(--line); padding-top: 45px; }
.about-columns h2 { font-size: 38px; letter-spacing: -.05em; margin: 10px 0; }
.about-columns p { color: #96928a; line-height: 1.65; }
.back-link { display: inline-flex; margin-top: 80px; border-bottom: 1px solid #777; padding-bottom: 5px; font: 800 10px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; }
@media (max-width: 900px) {
  .about-columns { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .about-main { padding: 80px 24px 70px; }
  .about-main h1 { font-size: 74px; }
}
```

Then update the `<link>` tag in `web/about/index.html`:

```html
<!-- change: -->
  <link rel="stylesheet" href="../styles.css" />
<!-- to: -->
  <link rel="stylesheet" href="./about.css" />
```

- [ ] **Step 4: Delete the old static frontend files**

```bash
git rm web/app.js web/styles.css web/config.js
```

- [ ] **Step 5: Update `README.md`'s "Local frontend preview" section**

Replace:

```markdown
## Local frontend preview

The frontend requires no npm install.

```bash
cd web
python3 -m http.server 4173
```

Open `http://localhost:4173`.
```

with:

```markdown
## Local frontend preview

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:4173`.
```

Also update the "Contract tooling" section's build/deploy step 2, where it says the frontend is configured by writing `web/config.js` — add a one-line note that in production this file lives at `web/public/config.js` pre-build (Vite copies it into `web/dist/config.js` unchanged), so `node scripts/configure.mjs` continues to work exactly as documented; no other README changes are needed since `scripts/configure.mjs`, `deploy.sh`, and `start.sh` are unmodified.

- [ ] **Step 6: Verify lint, typecheck, and build from a clean install**

```bash
cd web
rm -rf node_modules dist
npm install
npm run lint
npm run typecheck
npm run build
```

Expected: all commands exit 0. `web/dist/index.html`, `web/dist/config.js`, `web/dist/assets/button-token.png` all exist.

Run: `ls web/dist && cat web/dist/config.js`
Expected: `config.js` present with the empty/default `window.BUTTON_CONFIG` object (preview mode).

- [ ] **Step 7: Manual browser smoke test (preview mode)**

Start the built app locally and drive it exactly as a user would — this is the acting engineer's own verification step, using whatever local dev-server/browser tooling is available (e.g. `npm run preview` plus a browser), not an automated test:

```bash
cd web && npm run preview
```

With the preview server running:
1. Load the page. Confirm the `PREVIEW MODE — NOT ONCHAIN` banner is visible and the countdown is running from 60s.
2. Click PRESS before the timer runs out. Confirm: the button becomes disabled and reads `SPENT`, the identity line reads `YOU ARE <FACTION> · YOUR ONE PRESS IS SPENT`, a new row appears at the top of the live tape with a brief flash animation, and the countdown timer pulses once.
3. Confirm the stats panel's `TOTAL PRESSES` reads `1` and the faction bar for the matching faction shows `1 · 100.0%`.
4. Resize to a mobile width (e.g. 375px) and confirm the button stage remains the dominant element and the layout stacks without horizontal scrolling.
5. Wait for the countdown to reach 0 without a second wallet (not reachable in single-tab preview mode since one press resets it — instead confirm visually that the countdown continues counting down correctly after the reset, matching the reset-to-60 rule).

Record any visual or behavioral discrepancy against `web/styles.css`'s original rendering and fix before proceeding.

- [ ] **Step 8: Commit**

```bash
git add web/vercel.json web/about README.md
git commit -m "chore(web): migrate assets/about page to Vite build, update README preview instructions"
```

- [ ] **Step 9: Final report**

Summarize for the user:
- Full list of files changed (created/modified/deleted) across all 15 tasks.
- Confirmation that `npm run lint`, `npm run typecheck`, and `npm run build` all pass from a clean install.
- Confirmation of manual preview-mode smoke test results from Step 7.
- Remaining TODOs from the design spec section 11: no automated frontend test suite; `web/about/index.html` not componentized into the SPA; no multi-wallet-provider modal.
- A reminder that testnet/mainnet contract states (sealed, live-on-real-chain, wrong-network, tx-pending/failed, RPC-stale) are unverified by this plan's manual smoke test since no contract is deployed yet — they were ported faithfully from the original `web/app.js` logic (traced line-by-line in this plan's task descriptions) but should be re-verified against a real deployed contract per `LAUNCH_CHECKLIST.md` before any production activation, exactly as the existing checklist already requires.

---

## Self-Review Notes

- **Spec coverage:** Architecture (§3) → Tasks 1–3. Directory structure (§4) → matches every task's file paths. Component responsibilities (§5) → Tasks 10–14. Data layer (§6) → Tasks 6–9. States matrix (§7) → implemented inline across `PressStage`/`SystemStrip`/`LivePressFeed` (Tasks 10–12), traced to source. Design system (§8) → Task 4 (tokens/global) + every component's CSS Module ported with exact source line references. Tooling (§9) → Task 1 scripts, verified at the end of every task and again fully in Task 15. Migration (§10) → Task 15. Out-of-scope (§11) → called out in Task 15's final report.
- **Placeholder scan:** no TBD/TODO markers in any task's deliverable code; the only forward-looking notes are the explicit, itemized "Out of scope" list carried from the spec.
- **Type consistency:** `ExperimentState`, `PressEvent`, `UserPressState`, `Faction` (Task 2) are the single source of truth for these shapes and are imported (never redefined) by every later task. `CountdownReading` (Task 9) and `PressFeed`/`PreviewClockState` (Tasks 7/9) are likewise defined once and imported everywhere they're used, including in the Task 14 refactor of `PressStage`'s props.

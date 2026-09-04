# BUTTON / RDDT

**One wallet. One press. One shared clock.**

BUTTON is a Robinhood Chain social experiment inspired by Reddit's 2015 **The Button**. A single shared timer counts down from 60 seconds. Each wallet may press exactly once. A valid press resets the shared timer to 60. When the clock reaches zero, the experiment is over forever — no restart, no "season 2," no admin override.

## What BUTTON is

A minimal smart contract (`ButtonExperiment.sol`) — permanently unmodifiable and non-upgradeable code, with exactly one narrow admin power written into it (see [Contract rules](#contract-rules)) — paired with a frontend that reads all state and history directly from onchain data. There is no backend, no database of record, and no invented statistic anywhere in the product — every number on the site is either read live from the contract or derived from its own emitted events.

The BUTTON token is deliberately **not** used for access, rewards, yield, prizes, or governance of the experiment. The token is the cultural layer; the contract is the experiment. Holding, trading, or not holding BUTTON has zero effect on whether a wallet can press, when it presses, or what faction it lands in.

## Why it exists

Reddit's original primitive was strong precisely because it gave millions of people almost nothing: one irreversible action, a shared clock, and a visible identity based on *when* they acted — not how much they held, staked, or spent. Nothing about the outcome could be bought.

BUTTON preserves that simplicity while making the rule enforcement and the entire history public and independently verifiable onchain, so "the rules are the rules" isn't a promise from an operator — it's a property of code anyone can read, test, and re-run themselves (see [Verification](#verification)).

## How the experiment works

1. The starter deploys the contract. It is **sealed** — the clock has not started.
2. The starter calls `start()` exactly once, ever — this cannot be called again by anyone, including the starter. The clock begins at 60 seconds.
3. Any wallet that has never pressed may call `press()`. A successful press:
   - resets the shared deadline to 60 seconds from that transaction's block timestamp
   - permanently marks that wallet as spent — it can never press again, on any device, in any browser
   - assigns a faction based on how many seconds were left when it executed (see [Faction system](#faction-system))
4. At any point while the experiment is alive, the starter may also call `resetTimer()` to push the deadline back to a fresh 60-second window — publicly, an unlimited number of times, with no effect on who has already pressed, their faction, or the press/closest-call record. This is the contract's one ongoing admin power, and it is deliberately narrow: see [Contract rules](#contract-rules).
5. If the deadline passes with nobody pressing (and the starter doesn't reset it in time), the experiment ends **permanently**. Every future `press()` call reverts, forever, and `resetTimer()` reverts too — nothing, not even the starter, can revive it. There is no `finalize()`-triggered reset, no timeout extension, nothing that ever brings it back once it's actually over.

## Robinhood Chain architecture

```
INJECTED WALLET  →  BROWSER (React · wagmi · viem)  →  ROBINHOOD CHAIN (JSON-RPC)  →  ButtonExperiment
                          ↓
                   IndexedDB (local cache of Pressed events — read-path only, never authoritative)
```

No backend server sits between the browser and the chain. The frontend submits `press()` directly through whatever EVM wallet is injected into the page, and reads every piece of shared state — `started`, `isAlive`, `deadline`, `totalPresses`, faction counts, a wallet's own `hasPressed` — straight from contract storage via RPC. The only thing that lives outside the contract is a local, per-browser cache of decoded `Pressed` events (see [Event history architecture](#event-history-architecture)), which backs the live tape, `/history`, and `/stats` pages but never the pass/fail question of whether a press succeeds.

Network parameters (verified against Robinhood Chain's own docs, not assumed):

Mainnet:

- Chain ID: `4663`
- Gas asset: `ETH`
- RPC: `https://rpc.mainnet.chain.robinhood.com`
- Explorer: `https://robinhoodchain.blockscout.com`

Testnet:

- Chain ID: `46630`
- Gas asset: `ETH`
- RPC: `https://rpc.testnet.chain.robinhood.com`
- Explorer: `https://explorer.testnet.chain.robinhood.com`

Deploy to testnet first, always.

Repository layout:

`contracts/src/ButtonExperiment.sol`
: The entire experiment. The starter can only call `start()` once, ever. The starter can also call `resetTimer()` any number of times, but only while the experiment is alive — it can never revive one that has already ended, and it never touches press history. See [Contract rules](#contract-rules).

`web/`
: React + TypeScript + Vite frontend. Reads contract state and events directly from Robinhood Chain JSON-RPC (via viem/wagmi) and submits `press()` through an injected EVM wallet.

`web/public/config.js`
: Runtime network, contract, deploy-block, transaction-hash, and token-link configuration — generated by `scripts/configure.mjs`, validated by `scripts/validate-env.mjs`, and copied unchanged into the build output. Never hand-edit this file for a real deployment; regenerate it from environment variables.

`contracts/ButtonExperiment.abi.json`
: ABI for external integrations/indexers.

`scripts/`
: Deployment, verification, environment-validation, lifecycle-testing, and local-demo tooling — see [Deployment](#deployment) and [Verification](#verification).

`web/e2e/`
: End-to-end tests that boot a real local chain and drive the actual UI — see [Testing](#testing).

## Contract rules

- fixed 60-second window
- one press per wallet, forever
- no payable functions, no treasury, no token gating, no reward distribution
- no owner withdrawal, no pause, no fee switch, no upgradeability
- the starter has exactly two privileged actions: a one-time `start()`, and an unlimited-use `resetTimer()` that pushes the deadline back to a fresh 60 seconds
- `resetTimer()` only ever works while `isAlive()` is true — it reverts before `start()` and it reverts once the deadline has genuinely passed, so it can never revive a dead experiment, and it never touches `hasPressed`, faction assignments, `totalPresses`, or `closestCall`
- every `resetTimer()` call is a public, indexed `TimerReset` event — there is no way to use this power silently
- `finalize()` is permissionless and only seals the historical ending after expiry; it cannot alter the outcome and nothing depends on it being called — `isAlive()` already returns `false` the instant the deadline passes
- no reentrancy surface (no external calls anywhere in `press()`, `start()`, or `finalize()`)
- gas cost per press does not grow with participation — verified up to 100 simultaneous same-block presses in `contracts/test/ButtonExperiment.t.sol`

Full trust-assumption breakdown (timestamp assumptions, RPC/indexer assumptions, what the contract deliberately does *not* enforce): see [Security](#security).

## Faction system

A press's faction is determined entirely by `block.timestamp` **at the moment the transaction executes** — never by the instant a user clicked in their browser. A user may click at 8 seconds remaining but land in a later band if another wallet's transaction reset the clock first; the contract's execution-time result is always the authoritative one.

| Faction | Seconds remaining | Notes |
|---|---|---|
| PURPLE | 60–52 | |
| BLUE | 51–42 | |
| GREEN | 41–32 | |
| YELLOW | 31–22 | |
| ORANGE | 21–12 | |
| RED | 11–0 | 0 itself is unreachable — pressing exactly at the deadline reverts, so 1 second is the closest any wallet can ever get |
| GREY | — | frontend-only label for a wallet that has never pressed; the contract has no concept of it |

Faction identity is built entirely around *when* someone pressed, never around token ownership, gas spent, or wallet balance — a leaderboard, hall of fame, or milestone on `/stats` ranks participants by press count and timing only.

## Local development

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:4173`.

With no contract configured, the site enters a very obvious **PREVIEW MODE — NOT ONCHAIN** banner. It demonstrates the interaction locally but never fabricates chain activity — nothing is written to the database of record, and no press event, wallet, or statistic shown in preview mode is claimed to be real.

### Local demo (real local chain, no fakes)

For a lifecycle demonstration that is actually onchain — not preview mode's local-only simulation — `scripts/demo.sh` boots a real [Foundry `anvil`](https://book.getfoundry.sh/anvil/) node, deploys the exact contract in `contracts/src/ButtonExperiment.sol` using the same `Deploy.s.sol`/`Start.s.sol` scripts production deploys use, submits one real press, and then demonstrates the contract rejecting a second press from the same wallet:

```bash
./scripts/demo.sh
```

Every value it prints — the deadline before/after the press, the assigned faction, the decoded `Pressed` event, the `AlreadyPressed` revert on the second attempt — is read back from the chain with `cast call`/`cast receipt` after the transaction landed, never computed locally or trusted from a script's own simulation output. (An earlier version of this script printed values from inside a `forge script`'s local simulation and got them silently wrong — `vm.warp` only affects the simulation, not the real broadcast transactions. Caught by cross-checking with `cast call`; every value this script now prints is a real post-broadcast read.) The script leaves the anvil node running and writes `web/public/config.js` to point at it, so the running dev server shows the exact same deployment live. Stop it with `kill $(cat /tmp/button-demo-anvil.pid)`.

## Testing

Three independent layers, each proving something the others can't:

```bash
# Contract: unit, fuzz, and stateful invariant tests (Foundry)
cd contracts && forge test -vvv

# Frontend unit/integration tests: pure domain logic, config parsing, the
# IndexedDB event store, and the reorg-safety sync/reconciliation logic
cd web && npm test

# End-to-end: a real anvil chain + real deployed contract + a real browser
# driving the actual app UI — see web/e2e/ (globalSetup boots the chain,
# globalTeardown tears it down and restores whatever public/config.js had)
cd web && npm run test:e2e

# Full reproducible onchain lifecycle test against any deployed-but-sealed
# contract (local anvil during development, or a real testnet deployment
# before activation) — see Deployment below for the required env vars
./scripts/lifecycle-check.sh
```

The E2E suite is what actually exercises the full press → confirm → identity flow and the "second press is rejected" path end-to-end through the real UI, not through a lower-level API call — that distinction mattered during this repo's own hostile production audit: see [Security](#security) for two real bugs (a broken revert-explanation path, and a false "wallet error" banner from a silent background reconnect) that the E2E suite and manual real-device testing caught and a unit test could not have.

## Deployment

Every deploy/start action validates its required environment variables first and refuses to proceed if anything critical is missing or malformed (`scripts/validate-env.mjs`, wired into `deploy.sh` and `start.sh` automatically).

### 1. Deploy SEALED

```bash
export PRIVATE_KEY=0x...                 # a real, funded deployer key — never commit it
./scripts/deploy.sh testnet              # or: mainnet (requires I_UNDERSTAND_MAINNET=YES)
```

Deployment does **not** start the timer. Record the deployed contract address and deployment block — `contracts/broadcast/Deploy.s.sol/<chainId>/run-latest.json` has both.

### 2. Verify the source

```bash
./scripts/verify.sh testnet 0xYOUR_DEPLOYED_ADDRESS
```

Uses Robinhood Chain's own documented Blockscout verifier settings. Confirm the explorer shows a green "Verified" badge on the contract's Code tab before proceeding.

### 3. Configure the frontend

```bash
export VITE_RH_NETWORK=testnet
export VITE_BUTTON_CONTRACT=0xYOUR_DEPLOYED_ADDRESS
export VITE_CONTRACT_DEPLOY_BLOCK=123456
export VITE_DEPLOY_TX=0xYOUR_DEPLOY_TX_HASH      # optional — shown on /proof
export VITE_BUTTON_TOKEN=0xOPTIONAL_BUTTON_TOKEN
export VITE_TOKEN_URL='https://your-token-page.example'
export VITE_PAIR_LABEL='BUTTON / RDDT'
node scripts/validate-env.mjs frontend   # refuses to continue if anything's wrong
node scripts/configure.mjs
```

Serve the frontend and verify, **while the contract is still sealed**: correct network badge, correct contract address/explorer link, RPC status connected, hero says **THE BUTTON IS SEALED**, wallet connect and network switch both work, and no presses appear anywhere in the tape.

### 4. Test the full lifecycle before activating for real

```bash
export RPC_URL=https://rpc.testnet.chain.robinhood.com
export CONTRACT=0xYOUR_DEPLOYED_ADDRESS
export STARTER_KEY=0x...      # the deployer key from step 1
export PRESSER_A_KEY=0x...    # three funded, never-used-on-this-contract keys
export PRESSER_B_KEY=0x...
export PRESSER_C_KEY=0x...
./scripts/lifecycle-check.sh
```

Walks sealed → start → first press → second wallet press (countdown reset) → duplicate-wallet rejection → a third press (faction observation) → raw event-log readback, asserting each step against the contract's own state. Add `WAIT_FOR_EXPIRY=1` to also wait out a real 60-second window and verify permanent expiry + `finalize()`.

### 5. Activate

```bash
export BUTTON_CONTRACT=0xYOUR_DEPLOYED_ADDRESS
export VITE_START_TX=...       # fill in after, for /proof — see step 3
./scripts/start.sh testnet     # or: mainnet
```

Requires a typed confirmation because activation is irreversible. **Do not activate mainnet before the public website is reachable** — the first 60-second window begins the instant `start()` is mined, and there is no second run.

See [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md) for the complete pre-activation checklist and the exact go-live order.

### Static hosting

The `web/` folder deploys directly to Vercel, Netlify, Cloudflare Pages, GitHub Pages, or any ordinary static host — no server secrets required. The app is client-side routed (`/`, `/history`, `/stats`, `/proof`, `/press/:number`, `/wallet/:address`), so the host must serve `index.html` for any path that isn't a real static file (`web/vercel.json` already includes this rewrite for Vercel).

## Verification

Nothing about BUTTON should require trusting this repository, this README, or the deployed website. The [`/proof`](#) page on the live site (and reproduced here) gives the exact commands:

1. **Confirm the deployed bytecode matches the published source** — check the contract's Blockscout "Code" tab for a green "Verified" badge (see step 2 of Deployment).
2. **Read live state directly, bypassing the website entirely**:
   ```bash
   cast call <CONTRACT> "started()(bool)" --rpc-url <RPC>
   cast call <CONTRACT> "isAlive()(bool)" --rpc-url <RPC>
   cast call <CONTRACT> "totalPresses()(uint256)" --rpc-url <RPC>
   ```
3. **Read the full press history as raw onchain events**:
   ```bash
   cast logs --from-block <DEPLOY_BLOCK> --to-block latest --address <CONTRACT> \
     "Pressed(address,uint8,uint8,uint256,uint256)" --rpc-url <RPC>
   ```
4. **Confirm the rules themselves, not just one deployment** — clone this repository and run `forge test -vvv`.
5. **Reproduce the full lifecycle locally, deterministically** — run `./scripts/demo.sh`.

## Event history architecture

BUTTON has **no backend or hosted indexer**. This was a deliberate choice, not an omission: the experiment is inherently small (one press per wallet, gas-paid, ended forever by a real deadline), so a database service, its hosting, and its own uptime would add real operational surface for a workload the browser can handle on its own.

Instead, each browser tab keeps its own local, persistent copy of the experiment's `Pressed` event history:

- **IndexedDB** (`web/src/data/eventDb.ts`) stores every decoded press, keyed by its transaction hash + log index, indexed by press number, faction, wallet, and timestamp — scoped to a database named after the configured contract address, so switching networks never mixes histories.
- **A cursor-based sync pass** (`web/src/data/sync.ts`) walks from the last persisted block to the chain's current head in bounded chunks (`eth_getLogs` over a few thousand blocks at a time, never the whole history in one call), persisting both the decoded events and the advancing cursor after **every chunk** — not just once at the end — so a closed tab or a dropped connection mid-backfill resumes from the last completed chunk on the next load instead of re-scanning from the deployment block.
- **A reorg-safety margin**: the sync cursor never advances past `latestBlock - 5`, and every pass re-walks that trailing window — a shallow reorg self-corrects (idempotent per-event upserts overwrite the stale record); a reorg deeper than 5 blocks can leave a stale entry in the local feed/history display only, never in the authoritative aggregate numbers (see below).
- **Polling, not a websocket** (`web/src/hooks/useEventSync.ts`) re-runs that same sync pass on a fixed interval, and immediately again on `visibilitychange` (tab wake) and `online` (network reconnect).
- **Pagination and filters read the local store**, never the chain — `/history`'s faction/wallet/press-number filters and its 50-row pages are IndexedDB queries; RPC calls only happen during sync.
- Core aggregate stats (total presses, closest call + wallet, most recent presser, faction distribution) are read directly from contract storage, not derived from the event log — the contract already tracks them authoritatively.

The reconciliation/backfill logic is unit- and integration-tested independent of a live chain — see `web/src/data/__tests__/`, run via `npm test` inside `web/` (Vitest + `fake-indexeddb`). Coverage includes a fresh multi-chunk backfill, resuming after a simulated multi-thousand-block gap, idempotent repeated polling, a client that throws mid-backfill, and the reorg-safety margin correcting a reassigned press.

Why `VITE_CONTRACT_DEPLOY_BLOCK` matters: Robinhood Chain produces blocks quickly, and the live tape intentionally avoids scanning the entire chain on every browser load. Supplying the deployment block lets the interface query the exact event range. Canonical totals and faction counts are read from contract storage regardless of this value.

## Security

See [`SECURITY.md`](SECURITY.md) for the full breakdown: contract trust assumptions, timestamp assumptions, RPC/indexer assumptions, exactly what admin intervention is and isn't possible after activation, non-upgradeability, and a list of real bugs this repository's own hostile production audit found and fixed (with root causes) rather than a generic disclaimer.

## Known limitations

- **The starter can push the clock back while the experiment is alive.** `resetTimer()` is a real, ongoing admin power, not a one-time action like `start()` — see [Contract rules](#contract-rules) and `SECURITY.md`. It cannot revive a dead experiment and cannot touch press history, but it does mean the countdown's exact end time is not solely determined by participant behavior. Every use is a public onchain event; nothing about it happens silently.
- **One wallet is not one human.** A person can control multiple wallets. BUTTON measures wallet behavior, not proof-of-personhood.
- **No native mobile wallet (WalletConnect) pairing.** The frontend connects only via an injected EIP-1193 provider — a browser extension, or a wallet app's own in-app browser (Robinhood Wallet, MetaMask Mobile). A visitor with neither gets an explicit, actionable message rather than a silent failure. Adding WalletConnect would mean a new external project-ID dependency; deliberately out of scope unless it becomes a real product requirement.
- **The event-history cache has a bounded, not absolute, reorg guarantee** — see [Event history architecture](#event-history-architecture). This never affects who can press, faction assignment, or any number the contract itself reports; it can, in the rare deep-reorg case, leave a stale row in the cosmetic feed/history display until the next full resync.
- **No formal third-party audit.** This repository is not a substitute for one. See `SECURITY.md`'s pre-mainnet checklist.

## References

- Robinhood Chain documentation: `https://docs.robinhood.com/chain/connecting/`
- Robinhood contract deployment documentation: `https://docs.robinhood.com/chain/deploy-smart-contracts/`

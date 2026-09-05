# BUTTON / RDDT

**One username. One press. One shared clock.**

BUTTON is a social experiment inspired by Reddit's 2015 **The Button**. A single shared timer counts down from 60 seconds. Each username may press exactly once. A valid press resets the shared timer to 60. When the clock reaches zero, the experiment is over forever — no restart, no "season 2," no admin override.

**This project pivoted off wallet-gated presses partway through its life — read [The wallet-removal pivot](#the-wallet-removal-pivot) before trusting anything else in this document.** The experiment originally ran entirely onchain, exactly as the rest of this README used to describe. It doesn't anymore, by deliberate operator decision: mainnet deployment meant asking visitors to connect a wallet holding real assets to press a button, and that friction was judged worse than the trade-off of moving regular presses to a plain database. `SECURITY.md` has the complete, honest account of what that costs.

## What BUTTON is now

A small Vercel-hosted app: a Postgres database holds the actual shared game (who's pressed, the countdown, faction history) behind a handful of API routes (`web/api/`), and a frontend that talks only to those routes for a regular visitor — no wallet, no gas, no transaction. Sitting alongside it, unconnected to what visitors experience, is the original smart contract (`ButtonExperiment.sol`) — still real, still deployed, still immutable — which only the operator's `/admin` page touches now, with a real wallet, for its own record-keeping.

The BUTTON token is deliberately **not** used for access, rewards, yield, prizes, or governance of the experiment. The token is the cultural layer; the experiment is the experiment. Holding, trading, or not holding BUTTON has zero effect on whether a username can press, when it presses, or what faction it lands in.

## Why it exists

Reddit's original primitive was strong precisely because it gave millions of people almost nothing: one irreversible action, a shared clock, and a visible identity based on *when* they acted — not how much they held, staked, or spent. Nothing about the outcome could be bought.

BUTTON preserves that simplicity. It no longer preserves the *onchain, independently-verifiable* part of the original design for regular presses — see the pivot section below and `SECURITY.md` for exactly what that costs and why the operator judged it worth paying.

## The wallet-removal pivot

The experiment shipped, was hostilely audited, and was deployed to Robinhood Chain testnet as a fully onchain design — every press a real wallet-signed transaction, every number independently verifiable by anyone, no server in the loop at all. That version of this README is preserved in git history if you want to read it.

Ahead of a real mainnet deployment, the operator concluded that asking visitors to connect a wallet holding real assets — just to press a button — was a bigger barrier than the product could afford, and that the fix wasn't better wallet-connect copy but removing the wallet requirement entirely for regular visitors. That is a real, deliberate trade-off, not a cost-free UX improvement:

- **Presses are no longer independently verifiable.** They live in a private Postgres database the operator controls directly. There is no public ledger, no cryptographic signature per press, and no way for a visitor to check a specific press against a source they don't have to trust.
- **"One press, forever" no longer has Sybil resistance.** A username is free to create and free to re-create — the server permanently enforces "one press per username," but nothing stops one person from using several usernames. A funded wallet with history was never proof-of-personhood either, but it was at least a real, non-free resource; a username is not.
- **What's still true:** the deployed contract, its verified source, and the operator's own `start()`/`resetTimer()` calls against it remain 100% real and independently checkable — they're just disconnected from what a regular visitor experiences. See `SECURITY.md` for the complete trust-assumption writeup, including a known, currently-unmitigated abuse vector (no rate limiting on the public press endpoint) that a real mainnet launch needs to address first.

## How the experiment works

1. A first-time visitor sees a short onboarding modal (the same lore above), then picks a username — 3–20 characters, letters/numbers/underscores. No wallet, no signature, no gas.
2. The operator activates the experiment once, ever, from `/admin` — this drives both the real (mostly symbolic, now) smart contract's `start()` and the database's own "started" flag together. The clock begins at 60 seconds.
3. Any username that has never pressed may press. A successful press:
   - resets the shared deadline to 60 seconds from that moment on the server
   - permanently marks that username as spent, enforced by a case-insensitive unique constraint in Postgres — it can never press again, from any browser, once it's been used
   - assigns a faction based on how many seconds were left when it executed (see [Faction system](#faction-system))
4. At any point while the experiment is alive, the operator may also trigger a reset — pushing the deadline back to a fresh 60-second window on both the contract and the database together, publicly documented, an unlimited number of times, with no effect on who has already pressed or their faction/closest-call record.
5. If the deadline passes with nobody pressing (and the operator doesn't reset it in time), the experiment ends **permanently**. Every future press attempt is rejected, forever — nothing, not even the operator, can revive it.

## System architecture

```
VISITOR'S BROWSER  →  VERCEL API (web/api/*.ts)  →  POSTGRES (source of truth for the game)

OPERATOR'S BROWSER  →  WALLET  →  ROBINHOOD CHAIN (JSON-RPC)  →  ButtonExperiment
                        (via /admin only — independent of the system above)
```

Two independent systems. A regular visitor never touches a wallet, gas, or Robinhood Chain at all — pressing is a plain `POST /api/press` call, and the countdown/history/stats pages poll `GET /api/state`, `/api/history`, `/api/stats`. Those routes (`web/api/`) are Vercel Functions backed by a Postgres database (provisioned via Vercel's Neon integration) — see `web/api/schema.sql` for the two-table schema and `web/api/_db.ts` for the shared query helpers. The operator's `/admin` page is the only part of the app that still touches the smart contract, gated by both a real wallet signature (the contract's own `onlyStarter` check) and a separate session-cookie login in front of the route itself (`web/middleware.ts`) — see `SECURITY.md` for the full breakdown of both.

Network parameters for the contract admin still operates (verified against Robinhood Chain's own docs, not assumed):

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
: The original onchain experiment, now operated only from `/admin`. The starter can only call `start()` once, ever. The starter can also call `resetTimer()` any number of times, but only while the experiment is alive — it can never revive one that has already ended, and it never touches press history. See [Contract rules](#contract-rules-admin-only-now).

`web/api/`
: The database-backed game regular visitors actually play. `_db.ts` (shared Postgres query helpers, schema types), `schema.sql` (the two-table schema — `game_state`, `presses`), `state.ts`/`press.ts`/`history.ts`/`stats.ts` (public, unauthenticated routes), `admin.ts` (start/reset/setTokenCA, gated by `middleware.ts`'s session-cookie login). `_press.test.ts` runs real integration tests against this layer directly against Postgres — see [Testing](#testing).

`web/middleware.ts`
: Vercel Edge Middleware gating `/admin` and `/api/admin` behind a signed session cookie, checked before the SPA or the API route ever runs. Unauthenticated, `/admin` gets a themed login page (`web/api/_adminLoginPage.ts`) instead of the browser's own Basic Auth prompt. See `SECURITY.md`.

`web/`
: React + TypeScript + Vite frontend. Regular pages talk only to `web/api/*`; `/admin` additionally connects a wallet and reads/writes the smart contract directly via viem/wagmi.

`web/public/config.js`
: Runtime network, contract, deploy-block, transaction-hash, and token-link configuration for the **admin-side contract only** — generated by `scripts/configure.mjs`, validated by `scripts/validate-env.mjs`, and copied unchanged into the build output. Never hand-edit this file for a real deployment; regenerate it from environment variables.

`contracts/ButtonExperiment.abi.json`
: ABI for external integrations/indexers.

`scripts/`
: Deployment, verification, environment-validation, lifecycle-testing, and local-demo tooling — see [Deployment](#deployment) and [Verification](#verification).

`web/e2e/`
: End-to-end tests that boot a real local chain and drive the actual UI — see [Testing](#testing).

## Database rules (what regular visitors actually experience)

- fixed 60-second window, enforced server-side in `web/api/press.ts`
- one press per username, forever — a case-insensitive unique index in Postgres (`presses_username_lower_idx`) is what actually makes a second press for the same name impossible, the same role `hasPressed` used to play onchain
- pressing is free: no wallet, no gas, no signature, no transaction
- the server computes faction and remaining-seconds from its own clock at the moment the request is processed — never from anything the client sends — mirroring the same math the contract used to run onchain (see [Faction system](#faction-system))
- the operator's `/admin` page is the only way to start or reset the game; there is no public start/reset endpoint
- **what this does not give you:** independent verification, Sybil resistance, or a rate limit on the public press endpoint — see [The wallet-removal pivot](#the-wallet-removal-pivot) and `SECURITY.md` for the complete, honest account

## Contract rules (admin-only now)

The original onchain contract still exists, still enforces all of the below, and is still what `/admin` operates — it just no longer processes regular presses. Kept here in full because it's still true and still real, not because it still describes what a visitor experiences:

- fixed 60-second window
- one press per wallet, forever (this guarantee applied when the contract processed real presses; see above for what governs presses now)
- no payable functions, no treasury, no token gating, no reward distribution
- no owner withdrawal, no pause, no fee switch, no upgradeability
- the starter has exactly two privileged actions: a one-time `start()`, and an unlimited-use `resetTimer()` that pushes the deadline back to a fresh 60 seconds
- `resetTimer()` only ever works while `isAlive()` is true — it reverts before `start()` and it reverts once the deadline has genuinely passed, so it can never revive a dead experiment, and it never touches `hasPressed`, faction assignments, `totalPresses`, or `closestCall`
- every `resetTimer()` call is a public, indexed `TimerReset` event — there is no way to use this power silently
- `finalize()` is permissionless and only seals the historical ending after expiry; it cannot alter the outcome and nothing depends on it being called — `isAlive()` already returns `false` the instant the deadline passes
- no reentrancy surface (no external calls anywhere in `press()`, `start()`, or `finalize()`)
- gas cost per press does not grow with participation — verified up to 100 simultaneous same-block presses in `contracts/test/ButtonExperiment.t.sol`

Full trust-assumption breakdown (timestamp assumptions, RPC/indexer assumptions, the database's own trust model, what neither system enforces): see [Security](#security).

## Faction system

A press's faction is determined by the remaining time **at the moment the press is processed** — the database's server clock now, the same way `block.timestamp` at transaction-execution time governed it onchain. A user may click at 8 seconds remaining but land in a later band if another press reset the clock first; the server's processing-time result is always the authoritative one, never the instant the button was clicked in the browser.

| Faction | Seconds remaining | Notes |
|---|---|---|
| PURPLE | 60–52 | |
| BLUE | 51–42 | |
| GREEN | 41–32 | |
| YELLOW | 31–22 | |
| ORANGE | 21–12 | |
| RED | 11–0 | 0 itself is unreachable — pressing exactly at the deadline is rejected, so 1 second is the closest anyone can ever get |
| GREY | — | frontend-only label for a username that has never pressed; the server has no concept of it |

Faction identity is built entirely around *when* someone pressed, never around token ownership, gas spent, or wallet balance — a leaderboard, hall of fame, or milestone on `/stats` ranks participants by press count and timing only.

## Local development

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:4173`.

Plain `npm run dev` serves the frontend, but **the regular press/countdown/history/stats pages need `web/api/*` to answer**, and Vite alone never serves that — it's a Vercel Functions convention. Two ways to get a real backend locally:

```bash
# Terminal 1: the actual API routes, backed by a real Postgres database
vercel env pull web/.env.vercel --environment=production   # once, to get DATABASE_URL locally
vercel dev --listen 3100                                   # run from the repo root, not web/

# Terminal 2: plain Vite, proxying /api/* to the vercel dev instance above
cd web && npm run dev
```

`vite.config.ts`'s dev-server `proxy` is what wires these two together — see its comment for why `vercel dev` alone was flaky for Vite's own HMR/module requests in this repo's testing. Without a database connection, `/api/*` calls fail gracefully (a clear "SERVER ERROR" status, never fabricated data) rather than hang or crash.

With no contract configured, `/admin` enters a very obvious **PREVIEW MODE** banner for the admin-side contract specifically. It never fabricates chain activity — nothing shown there in preview mode is claimed to be real.

### Local demo (real local chain, no fakes)

For a lifecycle demonstration that is actually onchain — not preview mode's local-only simulation — `scripts/demo.sh` boots a real [Foundry `anvil`](https://book.getfoundry.sh/anvil/) node, deploys the exact contract in `contracts/src/ButtonExperiment.sol` using the same `Deploy.s.sol`/`Start.s.sol` scripts production deploys use, submits one real press, and then demonstrates the contract rejecting a second press from the same wallet:

```bash
./scripts/demo.sh
```

Every value it prints — the deadline before/after the press, the assigned faction, the decoded `Pressed` event, the `AlreadyPressed` revert on the second attempt — is read back from the chain with `cast call`/`cast receipt` after the transaction landed, never computed locally or trusted from a script's own simulation output. (An earlier version of this script printed values from inside a `forge script`'s local simulation and got them silently wrong — `vm.warp` only affects the simulation, not the real broadcast transactions. Caught by cross-checking with `cast call`; every value this script now prints is a real post-broadcast read.) The script leaves the anvil node running and writes `web/public/config.js` to point at it, so the running dev server shows the exact same deployment live. Stop it with `kill $(cat /tmp/button-demo-anvil.pid)`.

This demonstrates the **contract's** lifecycle — real, unchanged by the pivot, but no longer what a regular visitor's press exercises. There is no equivalent "real, no fakes" demo for the database side beyond running it locally per the previous section; a real Postgres connection is real by construction, there's no local-vs-real distinction to demonstrate.

## Testing

Four independent layers, each proving something the others can't:

```bash
# Contract: unit, fuzz, and stateful invariant tests (Foundry) — the admin-only
# smart contract, unaffected by the pivot
cd contracts && forge test -vvv

# Frontend unit/integration tests: pure domain logic, config parsing, the
# IndexedDB event store (still used by the admin-side legacy chain pages),
# the reorg-safety sync/reconciliation logic, the admin middleware's auth
# logic, and — the one real-database exception — web/api/_press.test.ts,
# which runs directly against Postgres (start/reset, one-press-per-username
# case-insensitively, faction assignment, rejection after death), never
# mocked, and cleans up every row it touches
cd web && npm test

# End-to-end: a real anvil chain + real deployed contract + a real browser
# driving the actual admin UI — see web/e2e/ (globalSetup boots the chain,
# globalTeardown tears it down and restores whatever public/config.js had).
# Playwright's own webServer is plain Vite, which never serves web/api/*, so
# admin.spec.ts mocks the /api/admin call itself (asserting the request body
# sent, not just the copy) while still exercising the real onchain half —
# see that file's own comments for why, and web/api/_press.test.ts above for
# where the real database side is actually proven
cd web && npm run test:e2e

# Full reproducible onchain lifecycle test against any deployed-but-sealed
# contract (local anvil during development, or a real testnet deployment
# before activation) — see Deployment below for the required env vars
./scripts/lifecycle-check.sh
```

The E2E suite is what actually exercises the full onchain press → confirm → identity flow and the "second press is rejected" path end-to-end through the real UI — that mattered during this repo's own hostile production audit: see [Security](#security) for real bugs (a broken revert-explanation path, a false "wallet error" banner from a silent background reconnect) that the E2E suite and manual real-device testing caught and a unit test could not have. It predates the pivot and now exercises the admin-only contract path, not a regular visitor's press.

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
export VITE_DEPLOY_TX=0xYOUR_DEPLOY_TX_HASH      # optional, currently unused by any page
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
export VITE_START_TX=...       # optional, currently unused by any page — see step 3
./scripts/start.sh testnet     # or: mainnet
```

Requires a typed confirmation because activation is irreversible. This only starts the **contract** — regular visitors won't see anything change until the operator also starts the **database** game from `/admin`, which drives both together in one click (see `AdminPage.tsx`'s `syncDatabase`). **Do not activate the database before the public website is reachable** — the first 60-second window begins the instant it's started, and there is no second run.

See [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md) for the complete pre-activation checklist and the exact go-live order.

### Hosting

This is no longer a pure static site — `web/api/*` needs a real Vercel Functions runtime and a Postgres connection (`DATABASE_URL`), so it deploys to Vercel specifically, not an arbitrary static host. The app is client-side routed (`/`, `/history`, `/stats`, `/press/:number`, `/wallet/:address`, `/admin`), so `web/vercel.json`'s SPA rewrite still matters for any path that isn't a real static file or an API route.

## Verification

**This is now two different answers, not one — see [The wallet-removal pivot](#the-wallet-removal-pivot) and `SECURITY.md` for why.**

For the database-backed game a regular visitor plays: there is no independent verification path. It's a plain web app backed by a private database, same trust model as any ordinary website — not a gap in this list, a structural property of not using a wallet.

For the smart contract the operator still uses: nothing should require trusting this repository, this README, or the deployed website.

1. **Confirm the deployed bytecode matches the published source** — check the contract's Blockscout "Code" tab for a green "Verified" badge (see step 2 of Deployment).
2. **Read the contract's live state directly, bypassing the website entirely**:
   ```bash
   cast call <CONTRACT> "started()(bool)" --rpc-url <RPC>
   cast call <CONTRACT> "isAlive()(bool)" --rpc-url <RPC>
   cast call <CONTRACT> "starter()(address)" --rpc-url <RPC>
   cast call <CONTRACT> "timerResetCount()(uint256)" --rpc-url <RPC>
   ```
3. **Confirm the rules themselves, not just one deployment** — clone this repository and run `forge test -vvv`.
4. **Reproduce the full onchain lifecycle locally, deterministically** — run `./scripts/demo.sh`. This demonstrates what the contract still guarantees for admin actions, not a regular visitor's press.

## Event history architecture

**Two separate systems now — see the pivot section above.** The database-backed `/history` and `/stats` pages (what a regular visitor sees) read `web/api/history.ts`/`stats.ts`, which query Postgres directly — no local cache, no IndexedDB, no reorg concerns, because there's no chain involved. Everything below this point describes the **older, still-present IndexedDB architecture**, which the admin-adjacent legacy chain pages (`/press/:number`, `/wallet/:address`) still use to read the smart contract's own event history — increasingly a secondary path, not the site's primary data layer anymore.

BUTTON's onchain half has **no backend or hosted indexer**. This was a deliberate choice for that half, not an omission: the experiment is inherently small (one press per wallet, gas-paid, ended forever by a real deadline), so a database service, its hosting, and its own uptime would add real operational surface for a workload the browser can handle on its own. (The pivot introduced exactly the database this paragraph argued against — but for the *username* half of the system, where a shared, cross-visitor "who's pressed" state is unavoidable without a wallet's onchain identity to query directly. The two halves have different constraints; see `SECURITY.md` for the honest reasoning on each.)

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

- **Presses are not independently verifiable anymore.** The database-backed game is a plain trust relationship with the operator, not a cryptographic guarantee — see [The wallet-removal pivot](#the-wallet-removal-pivot). This is the single biggest change from the original design and is stated here deliberately, not buried.
- **No Sybil resistance.** "One press per username, forever" is real and server-enforced; "one press per person" is not enforced at all. A username costs nothing to create.
- **No rate limiting on the public press endpoint.** `/api/press` is unauthenticated by design (no wallet to authenticate with) and currently has no rate limit, CAPTCHA, or bot detection. A scripted client could flood it with disposable usernames — this doesn't let anyone press twice, but it could keep resetting the clock indefinitely or spam the history/leaderboard with junk. **Explicitly called out in `SECURITY.md`'s before-mainnet checklist as unmitigated, not accepted.**
- **The operator has full, unaudited access to the database.** Unlike the smart contract, where even the deployer couldn't alter press history through any code path, the operator can directly edit any row in Postgres. Nothing in this codebase prevents that — it's a pure trust relationship for the database half of the system, a real security boundary for the contract half.
- **The starter can push the clock back while the experiment is alive**, on both systems. `resetTimer()`/the database reset are a real, ongoing admin power, not a one-time action like `start()` — see [Contract rules](#contract-rules-admin-only-now) and `SECURITY.md`. Neither can revive a dead experiment or touch press history. Every onchain use is a public event; the database side has no public audit trail (see above).
- **One username is not one human**, same limitation "one wallet is not one human" always was, now with a lower cost to work around.
- **No native mobile wallet (WalletConnect) pairing** — relevant to `/admin` only now. The admin page connects only via an injected EIP-1193 provider — a browser extension, or a wallet app's own in-app browser (Robinhood Wallet, MetaMask Mobile). Deliberately out of scope unless it becomes a real product requirement.
- **The event-history cache (admin-side legacy chain pages only) has a bounded, not absolute, reorg guarantee** — see [Event history architecture](#event-history-architecture). Never affects the database-backed `/history`/`/stats` a regular visitor sees.
- **No formal third-party audit.** This repository is not a substitute for one. See `SECURITY.md`'s pre-mainnet checklist.

## References

- Robinhood Chain documentation: `https://docs.robinhood.com/chain/connecting/`
- Robinhood contract deployment documentation: `https://docs.robinhood.com/chain/deploy-smart-contracts/`

# Security notes

BUTTON is intentionally tiny. The experiment still has assumptions that should be
explicit. This document was substantially expanded after a hostile production audit
(assuming thousands of simultaneous, actively adversarial users) — see "Findings from
the hostile audit" below for what that audit actually found and fixed, not just what
it concluded was fine.

## What the contract enforces

- one successful press per wallet address
- a fixed 60-second window per reset (see the starter's `resetTimer()` power below)
- deterministic faction assignment from the remaining onchain time
- permanent, unrevivable expiry once the deadline is reached — the starter's admin
  power below explicitly cannot override this
- no pause, no withdrawal, no fee, no token gate, no upgrade, ever

The contract is the sole source of truth for all of the above. Every frontend
guard described below (disabled buttons, client-side "already pressed" checks,
network-level races) is a UX convenience, not a security boundary — the E2E suite
(`web/e2e/second-press-rejected.spec.ts`) specifically proves this by bypassing the
frontend's own guards and confirming the *contract* is what actually stops a second
press.

## Contract trust assumptions

- **The starter is trusted for two narrow, distinct powers — one spent once, one
  ongoing.** `start()` can only ever be called once, by anyone, ever; there is no
  code path that unsets `started`. `resetTimer()` can be called any number of
  times, but `isAlive()` gates it on both sides: it reverts before `start()` and it
  reverts once the deadline has genuinely passed, so it can never revive a dead
  experiment. Neither function can touch `hasPressed`, faction assignments,
  `totalPresses`, or `closestCall` — a careless or even malicious starter can stall
  the ending or fail to activate at all, but cannot alter who pressed, what they
  got, or fabricate a result. See "The starter's ongoing power" below for the full
  scope of `resetTimer()`, including why it was added and what it deliberately
  cannot do.
- **No reentrancy surface.** `press()`, `start()`, and `finalize()` make no external
  calls (no ETH transfers, no token calls, no callbacks) — there is nothing for a
  malicious wallet's fallback function to exploit.
- **No integer overflow/wrap risk.** `remaining` is explicitly bounded to `(0,
  WINDOW]` before the `uint8` cast (`if (remainingFull > WINDOW) revert
  InvalidTimestamp()`), so a `block.timestamp` far in the future (e.g. from a
  malicious or buggy chain fork) cannot silently wrap into a bogus small value.
- **Gas cost does not grow with participation.** `factionCounts` is a fixed
  `uint256[7]`; there is no loop over historical presses anywhere in the contract.
  Ten thousand simultaneous wallets pressing has the same per-transaction gas cost
  as the first press ever — verified by `test_Race_OneHundredWalletsPressInTheSameBlock`
  in `contracts/test/ButtonExperiment.t.sol`, which presses 100 distinct wallets in
  one block and asserts every wallet's bookkeeping (press number, faction, closest
  call) is exactly correct with no cross-contamination.

## Timestamp assumptions

- The experiment uses `block.timestamp`, the standard EVM time source, not any
  client-supplied value. A pressing wallet cannot lie about "when" it pressed — the
  faction and the new deadline are both derived entirely from the timestamp of the
  block the transaction is mined into.
- Miner/sequencer timestamp manipulation on Robinhood Chain (an L2) is bounded by
  the same assumptions as any EVM chain: a validator can shift `block.timestamp`
  by a small amount, but not arbitrarily, and doing so only affects which faction
  band a press lands in — never whether a press is valid, never `hasPressed`,
  never the one-press-per-wallet guarantee.
- The frontend's hundredths-of-a-second countdown animation is visual only,
  interpolated client-side between polls and corrected against `chainOffsetMs`
  (`state.deadline * 1000 - state.chainOffsetMs`, see
  `web/src/components/press/PressStage.tsx`) so a wrong or drifting local system
  clock cannot desync the *display* from the real deadline. It has no bearing on
  what actually happens onchain: a user who presses believing 0.1s remain either
  lands within the window (a real, contract-verified RED press) or the deadline has
  already passed and the transaction reverts with `ExperimentEnded` — there is no
  path where the frontend's clock affects the outcome.

## RPC/indexer assumptions

- **RPC failure is not contract failure.** Core experiment state polls every 2.5s;
  on failure the UI marks state `stale` and preserves the last-known values rather
  than resetting to a misleading default. If RPC has never succeeded even once, the
  status pill and the wallet's own tx-status line surface the actual RPC error
  text instead of an indefinite generic "loading" state.
- **A wallet's own "have I pressed" read can independently go stale.** This is
  tracked separately from core state (`useUserPress`'s `stale` field) — a
  connected wallet whose personal read fails is never shown as eligible to press
  again; the button explains `STALE` rather than guessing.
- **The event history cache (IndexedDB) has a bounded reorg-safety margin, not a
  guarantee.** `syncEvents` (`web/src/data/sync.ts`) never advances its cursor
  past `latestBlock - confirmations` (5 blocks in production, see
  `useEventSync.ts`), and re-scans that trailing window on every poll — so a reorg
  shallower than 5 blocks self-corrects (the idempotent per-key upsert simply
  overwrites the stale event). A reorg deeper than 5 blocks can leave a stale
  cached press event in the *local feed/history display only*. This never affects
  correctness of the numbers that matter (total presses, closest call, faction
  counts, any individual wallet's own status) — those are always read live from
  the contract's own storage, never derived from the cached event log.
- **No websocket dependency.** Every update — countdown, feed, stats — is a fresh,
  cursor-based poll (`eth_getLogs`/`readContract`), re-triggered immediately on
  tab-visibility and `online` events so a backgrounded tab or a dropped connection
  recovers without waiting for the next tick.
- **The event cache never blocks correctness.** If IndexedDB is unavailable,
  disabled, or the local chain is too young for the reorg-safety window to have
  cleared (e.g. right after `scripts/demo.sh` deploys), the live tape/history
  degrades to "no presses indexed yet" rather than hanging or showing wrong data —
  and self-heals as soon as enough blocks accumulate (verified manually during
  this audit by mining blocks past the confirmation window and observing the tape
  populate correctly).

## The starter's ongoing power: `resetTimer()`

This section exists because an earlier version of this contract, and an earlier
version of this document, said plainly that there was **no** admin reset power at
all, and that claim was displayed on the live site as one of the four core rules.
That changed by deliberate operator decision after the hostile audit below — this
section is the honest, complete replacement for that claim, not a footnote to it.

**What it is:** the starter may call `resetTimer()` at any time while the
experiment is alive to push the deadline back to a fresh 60-second window —
identical in effect to what a press does to the clock, but callable by the starter
alone, with no faction assigned and no press counted.

**What it deliberately cannot do, enforced onchain, not by convention:**

- **Cannot revive a dead experiment.** `resetTimer()` reverts with
  `ExperimentNotAlive` the instant `isAlive()` is false — before `start()`, and
  permanently after the deadline has genuinely passed. This is proven, not just
  asserted: `contracts/test/ButtonExperimentInvariant.t.sol`'s
  `invariant_EndedExperimentNeverReactivates` runs the reset handler
  *unconditionally, including after death,* across every fuzzer-generated action
  sequence, and the invariant that death is never reversed holds regardless.
- **Cannot touch press history.** `hasPressed`, `pressFaction`, `pressRemaining`,
  `pressNumber`, `totalPresses`, `closestCall`, and `factionCounts` are untouched by
  a reset — a wallet that already pressed stays permanently spent through any
  number of resets. Proven in `test_ResetTimer_DoesNotAffectPressHistoryOrStats`
  and the `invariant_ResetsNeverInflatePresses` /
  `invariant_TotalPressesMatchesSuccessfulPressGhost` invariants.
- **Cannot happen silently.** Every call emits a public, indexed `TimerReset`
  event (`admin`, `timestamp`, `newDeadline`, a running `resetNumber`) — the same
  event log anyone can independently read with `cast logs`, no different from a
  press. There is no code path to reset the timer without it being publicly,
  permanently visible onchain.
- **Cannot be a second identity.** `resetTimer()` uses the exact same `starter`
  address as `start()` — there is no separate admin role, no multisig requirement
  added, no new address to trust beyond the one this document already discusses.

**What this means for trust:** the starter can now stall the natural ending —
buying time if activity has stalled — but cannot manufacture, alter, or erase a
single press, and cannot ever bring the experiment back once it has truly ended.
"One wallet, one press, forever" and "permanent death at zero" both still hold
exactly as documented; "the clock only ever moves forward on its own" does not.

`finalize()` remains fully permissionless and purely historical, unaffected by any
of the above — it records the already-inevitable ending timestamp for indexers,
and nothing about the experiment's live/dead state depends on it being called.
There is no owner, no multisig, no timelock, and no upgrade proxy anywhere in this
system — `resetTimer()` is the one and only privileged, ongoing capability, and
everything above is its complete scope.

## `/admin` access control

`/admin` (`web/src/pages/AdminPage.tsx`) is the operator UI for `start()` and
`resetTimer()`. It has two independent layers, and it's worth being precise about
what each one actually does:

- **The contract's `onlyStarter` check is the real security boundary.** It's
  enforced by every node on the network, cannot be bypassed by finding the page,
  reading its source, or skipping the login below, and would reject a wrong-wallet
  caller even if `/admin` were fully public. This is unconditional and does not
  depend on anything described below.
- **`web/middleware.ts` is a Vercel Edge Middleware gate in front of the route
  itself**, checked before the SPA is served at all — an unauthenticated request to
  `/admin` gets a `401` and never receives `index.html` or any part of the JS
  bundle. Credentials (`ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD`) are
  read server-side only, from Vercel's own project environment variables — never
  `VITE_`-prefixed, never shipped to the client. It fails closed: if either
  variable is unset on a deployment, `/admin` returns `401` for everyone,
  including the real starter, rather than silently falling open.

**What this layer is for, and what it isn't for.** It exists to keep the operator
UI off crawlers, off link previews, and away from anyone who stumbles onto or
guesses the URL — not to add a second, independent security boundary the way a
banking login would: even a visitor who did get past this gate still cannot make
`start()` or `resetTimer()` succeed from any wallet but the real starter's — the
contract enforces that itself, unconditionally, the same as it always has.
`robots.txt` also disallows `/admin` as a courtesy to well-behaved crawlers, on
top of the `401` most of them would get anyway.

**Known limitations, stated plainly:**

- The password comparison in `middleware.ts` is a plain string equality check, not
  a constant-time comparison — a theoretical timing side-channel exists. Given the
  actual security boundary is the contract's own check (above), and this is a
  single low-value shared credential rather than a per-user login, that trade-off
  was made deliberately rather than pulling in a timing-safe-compare dependency
  for it.
- **`npm run dev` / `vite preview` do not run Vercel Middleware at all** — local
  admin access is exactly as open as it was before this existed. This only takes
  effect on an actual Vercel deployment. Verified with a direct unit test of the
  middleware's own auth logic (`web/middleware.test.ts` — fails closed with no
  credentials configured, rejects a missing/wrong/malformed `Authorization`
  header, accepts exactly the configured credentials) rather than end-to-end
  against a real deployment, since that would require linking this project to a
  Vercel account from this environment — deliberately not attempted without the
  operator's explicit go-ahead.

## Non-upgradeability

`ButtonExperiment` is deployed as a plain, non-proxied contract with an immutable
`starter` address set once in the constructor. There is no `delegatecall`, no proxy
pattern, and no storage layout designed for future migration. The deployed
bytecode is the entire, permanent implementation — "the rules cannot change" is a
property of the deployment, not a promise about future behavior.

## What it does not enforce

### One wallet is not one human

A person can control multiple wallets. BUTTON measures wallet behavior, not proof-of-personhood. Do not describe the result as one-human-one-press.

### Transaction ordering matters

The faction is determined when the transaction executes on Robinhood Chain. A user may click at 8 seconds but be included after another wallet has already reset the clock. The contract records the authoritative execution-time result. This includes the case where the *same* wallet's own previous press race-conditions against its own next click — the contract's `hasPressed` check makes a second press from any wallet, in any timing scenario, revert with `AlreadyPressed`.

### No native mobile wallet (WalletConnect) support

The frontend connects only via an injected EIP-1193 provider (`wagmi`'s `injected()`
connector) — a browser extension, or a mobile wallet's own in-app browser (e.g.
Robinhood Wallet, MetaMask Mobile). There is no WalletConnect integration. This was a
deliberate scope decision during the audit, not an oversight: adding WalletConnect
means an external project-ID dependency and a signup requirement, working against
this repo's minimal-external-dependency stance. A wallet with no injected provider
gets an explicit, actionable message ("NO INJECTED EVM WALLET · OPEN IN ROBINHOOD
WALLET OR METAMASK BROWSER") rather than a silent failure — see `TopBar.tsx`. If
mobile QR-pairing becomes a real product requirement, it should be a deliberate
follow-up, not folded in silently.

## Findings from the hostile audit

A hostile production audit (thousands of simultaneous, actively adversarial users)
was run against this repo, covering the full lifecycle from entry through permanent
ended state, predictable failure modes (RPC timeout, chain reorg, two tabs/two
devices with the same wallet, 100 simultaneous presses, page reload mid-pending-tx,
malformed config, and more), and a deterministic local demo proving the real
onchain lifecycle end-to-end. What it found and fixed:

- **The friendly revert explanation never actually rendered for a real reverted
  transaction.** `@wagmi/core`'s `waitForTransactionReceipt` throws instead of
  resolving with the receipt when a transaction reverts, and its own built-in
  revert-reason decoder assumes a legacy `Error(string)` revert — producing garbage
  for this contract's custom errors — then throws regardless. The result: every
  reverted `press()` showed a raw, undecoded `PRESS STATUS UNKNOWN · Execution
  reverted with reason: custom error 0x217423c4...` instead of the intended
  `YOUR WALLET HAD ALREADY PRESSED BEFORE THIS TRANSACTION WAS MINED`. Fixed in
  `PressStage.tsx` by re-fetching the receipt directly through viem's own
  `publicClient` (which does not have this throwing behavior) whenever wagmi's
  wrapper errors, and running it through the same `explainRevert` path a
  successful `receipt.data` would have used. Caught by, and regression-tested in,
  `web/e2e/second-press-rejected.spec.ts` — this specific bug could not have been
  caught by a unit test, since it only manifests in the real interaction between
  wagmi's query layer and a genuinely mined-and-reverted transaction.
- **A chain reorg could permanently corrupt the local event cache.** The IndexedDB
  `pressNumber` index was `unique: true`; a reorg that reassigns two presses'
  relative order could momentarily collide on `pressNumber`, throwing
  `ConstraintError` and aborting the whole sync pass. Fixed by dropping the
  uniqueness constraint (the real primary key is `key`, i.e. tx hash + log index,
  which stays a true 1:1 identity across a reorg of the same transaction) and by
  adding the reorg-safety confirmation margin described above. Regression-tested
  in `web/src/data/__tests__/eventDb.test.ts` and `sync.test.ts`.
- **A permanently failing RPC read could leave a wallet's own status silently
  stuck.** `useUserPress` swallowed read errors with no `stale`/error signal,
  meaning an already-pressed wallet whose personal read kept failing could show an
  enabled PRESS button indefinitely, and a wallet connecting for the first time
  under total RPC failure would see "loading" forever with no explanation. Fixed
  by adding a `stale` field that blocks pressing and explains why, and by
  surfacing `state.error` in the status pill once the very first load has failed.
- **A malformed deploy-block config value could crash the entire app at import
  time.** `BigInt(raw.contractDeployBlock)` was called unguarded on a value that
  ultimately comes from an environment variable a deploy script could typo. Fixed
  by validating the string is purely numeric first and falling back to `null`
  (a slower backfill from block 0, never a crash) otherwise. Covered in
  `web/src/config/__tests__/runtimeConfig.test.ts` with explicitly hostile inputs
  (non-numeric, negative, SQL-injection-shaped strings, `NaN`, `Infinity`).
- **A dead, duplicate event-fetching code path.** `usePressFeed.ts` was an earlier,
  unused implementation of live-feed polling, superseded by the IndexedDB-backed
  `useEventSync`/`useLiveFeed` architecture but never deleted — a second,
  untested, unwired data path that could have silently diverged from the real one.
  Removed.
- **The press button's accessible name never changed with its state.** A
  screen-reader user heard the same "Press the Button once forever" label whether
  the button said PRESS, PENDING, SWITCH, STALE, or SPENT — the visual state
  change was invisible to assistive technology beyond the native disabled/enabled
  signal. Fixed by making the label part of the accessible name.

What the audit deliberately did *not* change: the core experiment rules (one
wallet, one press, 60 seconds, permanent death at zero), the no-backend/no-indexer
architecture, and the decision not to add WalletConnect (see above) — these were
reviewed and are documented as accepted tradeoffs, not gaps.

## Change made after the hostile audit: the admin timer-reset power

Everything above this note describes the contract as it stood through the hostile
audit, which is also what was deployed and independently verified on Robinhood
Chain testnet. `resetTimer()` (see "The starter's ongoing power" above) was added
**after** that audit, as an explicit, deliberate operator decision — not a finding,
not a gap that was discovered, a scope change that was requested. Recorded here
for the same reason the audit findings are: so nobody has to take "it's fine" on
faith. The two guarantees the operator chose to keep non-negotiable when asked
— reset only works while alive (never revives a dead experiment), and reset
never touches press history — are the two enforced onchain and proven by the
invariant/unit tests cited above, not merely documented as intent.

Practically, this means the contract address verified earlier in this project's
testnet deployment record does **not** have this power (it predates the change and
is immutable) — a new deployment with the updated bytecode is required, and must
go through the same deploy → verify → configure → lifecycle-test sequence as any
other deployment before it's treated as the real one.

## Operational risk

Activation is irreversible. Deploy the contract in the sealed state first, publish and verify the website, then call `start()` only when the public interface is ready.

## Before mainnet

- run the full Foundry test suite (`cd contracts && forge test -vv`)
- run the frontend unit/integration suite (`cd web && npm test`)
- run the end-to-end suite against a real local chain (`cd web && npm run test:e2e`)
- deploy to Robinhood Chain testnet
- run the complete live → press → reset → expiry lifecycle with multiple wallets
- verify the source code on Blockscout
- confirm the production frontend points at the exact verified address and deploy block
- independently review the contract; do not treat this repository as an audit

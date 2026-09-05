# Security notes

BUTTON is intentionally tiny. The experiment still has assumptions that should be
explicit. This document was substantially expanded after a hostile production audit
(assuming thousands of simultaneous, actively adversarial users) — see "Findings from
the hostile audit" below for what that audit actually found and fixed, not just what
it concluded was fine.

**Read this next section before anything else in this file.** Everything from "What
the contract enforces" through "Findings from the hostile audit" describes the
contract as it stood *before* a later, separate operator decision removed the wallet
requirement for regular presses. All of it is still true and still real — it's just
no longer what a regular visitor's press goes through. "The database-backed game"
section, further down, is the trust model that actually governs regular visitors
today.

## The wallet-removal pivot

Ahead of a real mainnet deployment, the operator judged that asking visitors to
connect a wallet holding real assets — just to press a button — was a bigger barrier
than the product could afford, and that the fix wasn't better wallet-connect
messaging but removing the wallet requirement entirely for regular visitors. This
was a deliberate, explicit, security-relevant decision, not a quiet refactor, and it
trades away real guarantees:

- **Independent verifiability is gone for regular presses.** The original design's
  whole security value proposition was "the rules are enforced by code anyone can
  read, and every result is checkable by anyone, with no server and no operator
  trust required." A private Postgres database cannot offer that by construction —
  there is no cryptographic signature per press, no public ledger, and no way for a
  visitor to independently confirm a specific press happened the way the site
  claims. See "The database-backed game" below for exactly what replaced it.
- **Sybil resistance is gone.** A wallet with real funds and history was never
  proof-of-personhood, but it was at least a real, non-free resource to acquire. A
  username costs nothing. "One press per username, forever" is real and permanently
  enforced; "one press per person" is not enforced at all, in any way.
- **The operator gained a genuinely new power: full, direct database access.** The
  original contract was designed so that even a malicious starter couldn't alter
  press history, faction assignments, or totals through any code path — `resetTimer()`
  was deliberately built to prove this (see below). The database has no equivalent
  protection: the operator can edit any row directly. Nothing in this codebase
  prevents that. This is stated here because it's true, not because it's been
  mitigated.
- **What's unaffected:** the smart contract itself, its `onlyStarter` guarantees, and
  everything below through "Findings from the hostile audit" remain exactly as
  audited and described — they're just now exercised only by the operator's own
  `/admin` actions, disconnected from what a regular visitor does.

See "Change made after the hostile audit: removing the wallet requirement" near the
end of this document for when this happened relative to the audit below, matching
the same disclosure pattern already used for the `resetTimer()` addition.

## What the contract enforces

- one successful press per wallet address
- a fixed 60-second window per reset (see the starter's `resetTimer()` power below)
- deterministic faction assignment from the remaining onchain time
- permanent, unrevivable expiry once the deadline is reached — the starter's admin
  power below explicitly cannot override this
- no pause, no withdrawal, no fee, no token gate, no upgrade, ever

The contract is the sole source of truth for all of the above. Every frontend
guard described below (disabled buttons, client-side "already pressed" checks,
network-level races) is a UX convenience, not a security boundary — the Foundry
suite (`contracts/test/ButtonExperiment.t.sol`) proves this at the contract level
directly. (An earlier E2E test, `web/e2e/second-press-rejected.spec.ts`, proved the
same thing through the real UI by bypassing the frontend's own guards; it was
removed when the wallet-based press flow it exercised was replaced — see "The
database-backed game" below for what a regular press goes through now.)

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
`resetTimer()` — and, since the wallet-removal pivot, also drives the
database-backed game via `POST /api/admin` (see "The database-backed game" below
for what that endpoint does). It has two independent layers, and it's worth being
precise about what each one actually does:

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
  including the real starter, rather than silently falling open. The same matcher
  and the same realm cover `POST /api/admin`, so a browser that already
  authenticated to load `/admin` sends its cached credentials on that request too —
  no separate login step, and no unauthenticated caller can reach it either.

**How the two systems stay in sync (and what happens when they don't).** After a
real onchain `start()`/`resetTimer()` transaction succeeds, `AdminPage.tsx` calls
`POST /api/admin` to apply the same action to the database. If that call fails —
a network blip, the database being briefly unreachable — the onchain transaction
has already succeeded and cannot be undone, but the database has not been updated
to match. This is surfaced explicitly (a "DATABASE SYNC FAILED" status with a
dedicated retry button that re-calls `/api/admin` alone, without needing another
onchain transaction) rather than silently assumed to have worked. The two systems
*can* diverge; the failure mode is visible and recoverable, not silent.

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

## The database-backed game

This is the trust model that actually governs a regular visitor's press today —
everything above this point describes the contract, which `/admin` still uses but
regular presses no longer touch.

**What it is:** a Postgres database (provisioned via Vercel's Neon integration),
queried through a handful of Vercel Functions (`web/api/`): `state.ts` (read the
shared countdown/totals), `press.ts` (submit a press), `history.ts`/`stats.ts`
(read past presses and aggregates), `admin.ts` (start/reset, gated as described
above). Schema in `web/api/schema.sql`: a single-row `game_state` table (started,
deadline, totals, closest call) and a `presses` table (one row per successful
press, keyed by username).

**What it enforces, for real:**

- **One press per username, forever, case-insensitively.** `presses_username_lower_idx`
  is a Postgres `UNIQUE` index on `lower(username)` — a second press attempt for
  the same username (any casing) fails the `INSERT` with a `23505` unique-violation
  error, which `press.ts` catches and reports as `ALREADY_PRESSED`. This is a real,
  atomic, race-safe constraint enforced by the database engine itself, not an
  application-level check-then-write that a concurrent request could slip past.
- **Faction and remaining-seconds are computed server-side, from the server's own
  clock, at the moment the request is processed** — never from anything the
  client sends — mirroring exactly what `block.timestamp`-at-execution-time did
  onchain. `factionForRemaining` is the same pure function imported directly from
  `src/domain/factions.ts`, not a reimplementation that could silently drift from
  the client-displayed logic.
- **Deadline/total-count updates are atomic single `UPDATE` statements** (e.g.
  `total_presses = total_presses + 1` in the same statement as the deadline write),
  safe under concurrent presses because Postgres serializes row-level writes — not
  a read-modify-write race across two round trips.
- **`start()`/`reset` mirror the contract's own guards**: start fails with
  `ALREADY_STARTED` if already started; reset fails with `NOT_ALIVE` if the game
  isn't currently alive — the same "can never revive a dead experiment" property,
  just enforced by an application-level check against `game_state.deadline`
  instead of a Solidity `require`.
- Verified directly against a real database, not mocked: `web/api/_press.test.ts`
  runs the actual handler functions against real Postgres (start-once, one-press-
  per-username case-insensitively, faction assignment, rejection before start and
  after death, state consistency), cleaning up every row it creates.

**What it deliberately does not, and cannot, enforce — stated plainly, not
mitigated:**

- **No independent verification.** There is no cryptographic signature per press,
  no public ledger, and no way for a visitor to check a specific press against a
  source that isn't this database. "Trust the operator's server" is the actual
  model, the same as any ordinary web app — not a smart contract's model.
- **No Sybil resistance whatsoever.** The unique index makes a *username*
  permanently spent; it does nothing to stop one person from using an unlimited
  number of different usernames. A wallet with real funds and transaction history
  was never proof-of-personhood either, but it was at least a real, costly
  resource; a username is free.
- **No rate limiting, CAPTCHA, or bot detection on the public endpoints.**
  `POST /api/press` has no wallet to authenticate against, by design — but that
  also means it has no gas cost and no per-caller throttling of any kind. A
  scripted client could submit an unbounded number of disposable usernames per
  second. This cannot let anyone press twice (the unique index still holds), but
  it could: keep the deadline perpetually reset (denying the "ends forever"
  outcome participant behavior is supposed to produce), or flood `/history` and
  the leaderboard with junk entries. **This is a real, currently-unmitigated gap,
  listed here and in the "Before mainnet" checklist below — not something this
  document is claiming is fine.**
- **The operator has full, direct, unaudited access to the database.** Unlike the
  contract — where `resetTimer()` was deliberately built and proven (via the
  invariant tests cited above) to be incapable of altering press history no matter
  what the starter does — nothing in this codebase stops the operator from editing
  any row in Postgres directly: changing a past press's faction, fabricating a
  closest call, deleting a row. This is a pure trust relationship for this half of
  the system. Said here because it's true, not because there's a mitigation to
  point to.
- **A malformed or missing database connection fails closed, not silently.**
  Every route in `web/api/_db.ts` throws immediately if `DATABASE_URL` is unset;
  every handler catches its own errors and returns a real HTTP error status
  (never a fabricated 200 with placeholder data). The frontend's `useGameState`/
  `useStats`/`useHistoryPage` hooks surface a `SERVER ERROR`/stale state rather
  than guessing.

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
reviewed and are documented as accepted tradeoffs, not gaps, **at the time of the
audit.** The no-backend architecture was later revised by explicit operator
decision — see the next section but one — for reasons unrelated to anything the
audit found.

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

## Change made after the hostile audit: removing the wallet requirement

Like the `resetTimer()` addition above, this happened **after** the hostile audit
concluded, as a separate, deliberate operator decision — not a finding from that
audit, and not related to anything it found. The audit's own conclusions about the
contract (everything from "What the contract enforces" through "Findings from the
hostile audit") remain accurate; they just describe a system regular visitors no
longer interact with.

The reason, stated plainly: ahead of a real mainnet deployment, the operator judged
that requiring a wallet holding real assets to press a button was a bigger barrier
to participation than the product could afford, and that the honest fix was
removing the requirement, not disguising it. "The database-backed game" section
above is the complete account of what that costs (independent verifiability, Sybil
resistance) and what it doesn't touch (the contract itself, still real, still
operated by `/admin`).

This was a genuine second pivot in this document's history, and it's recorded here
for the same reason the `resetTimer()` change is: so nobody reading only the older
sections of this file mistakes them for a description of what ships today.

## Operational risk

Activation is irreversible on both systems now. Deploy the contract in the sealed
state first, publish and verify the website, then activate the database game from
`/admin` only when the public interface is ready — the first 60-second window
begins the instant that happens, and there is no second run.

## Before mainnet

- run the full Foundry test suite (`cd contracts && forge test -vv`)
- run the frontend unit/integration suite (`cd web && npm test`) — includes
  `web/api/_press.test.ts` against a real database
- run the end-to-end suite against a real local chain (`cd web && npm run test:e2e`)
- deploy to Robinhood Chain testnet
- run the complete live → press → reset → expiry lifecycle with multiple wallets
- **add rate limiting (or equivalent abuse protection) to `POST /api/press` before
  any real launch** — see "The database-backed game" above; this is the one
  concretely unmitigated gap this document identifies, not a hypothetical
- decide on, and document, an operational safeguard for direct database access
  (who has the credential, is every write logged, is there a way to detect an
  out-of-band edit) — there is currently none beyond "trust the operator," which
  should be a conscious decision before real users' presses depend on it
- verify the source code on Blockscout
- confirm the production frontend points at the exact verified address and deploy block
- independently review the contract; do not treat this repository as an audit

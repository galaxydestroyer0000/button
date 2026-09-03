# BUTTON / RDDT

**One wallet. One press. One shared clock.**

BUTTON is a Robinhood Chain social experiment inspired by Reddit's 2015 **The Button**. A single shared timer counts down from 60 seconds. Each wallet may press exactly once. A valid press resets the shared timer to 60. When the clock reaches zero, the experiment is over forever.

The BUTTON token is deliberately **not** used for access, rewards, yield, prizes, or governance of the experiment. The token is the cultural layer; the contract is the experiment.

## Product thesis

Reddit's original primitive was strong because it gave millions of people almost nothing: one irreversible action, a shared clock, and visible identity based on when they acted. BUTTON preserves that simplicity while making the rule enforcement and history public onchain.

Original faction timing bands preserved by the contract:

- PURPLE: 60–52 seconds
- BLUE: 51–42
- GREEN: 41–32
- YELLOW: 31–22
- ORANGE: 21–12
- RED: 11–0
- GREY is frontend-only: a wallet that has never pressed.

A transaction's faction is determined by the **block timestamp when the press executes**, not the instant the user first clicks in the browser.

## Architecture

`contracts/src/ButtonExperiment.sol`
: Minimal immutable experiment contract. The starter can only call `start()` once. After activation there is no privileged state-changing path.

`web/`
: Dependency-free static frontend. It reads contract state and events directly from Robinhood Chain JSON-RPC and submits `press()` through an injected EVM wallet. There is no database required for correctness.

`web/config.js`
: Runtime network, contract, deploy-block and token-link configuration.

`contracts/ButtonExperiment.abi.json`
: ABI for external integrations/indexers.

## Robinhood Chain

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

Deploy to testnet first.

## Local frontend preview

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:4173`.

With no contract configured, the site enters a very obvious **PREVIEW MODE — NOT ONCHAIN**. It demonstrates the interaction locally but never fabricates chain activity.

## Contract tooling

Install Foundry, then install the test dependency once:

```bash
cd contracts
forge install foundry-rs/forge-std --no-commit
forge test -vv
```

### 1. Deploy SEALED to Robinhood Chain testnet

From the repository root:

```bash
export PRIVATE_KEY=0x...
./scripts/deploy.sh testnet
```

Deployment does **not** start the timer. Record:

- deployed contract address
- deployment block number

### 2. Configure the frontend before activation

```bash
export VITE_RH_NETWORK=testnet
export VITE_BUTTON_CONTRACT=0xYOUR_CONTRACT
export VITE_CONTRACT_DEPLOY_BLOCK=123456
export VITE_BUTTON_TOKEN=0xOPTIONAL_BUTTON_TOKEN
export VITE_TOKEN_URL='https://your-token-page.example'
export VITE_PAIR_LABEL='BUTTON / RDDT'
node scripts/configure.mjs
```

In production this file lives at `web/public/config.js` pre-build (Vite copies it into `web/dist/config.js` unchanged), so `node scripts/configure.mjs` continues to work exactly as documented.

Serve the frontend and verify all of these while the contract is sealed:

- correct Robinhood network badge
- correct contract address / Blockscout link
- RPC status = connected
- hero says **THE BUTTON IS SEALED**
- wallet connect and network switch work
- no fake presses appear in the tape

### 3. Test the irreversible lifecycle on testnet

When the site is ready:

```bash
export BUTTON_CONTRACT=0xYOUR_CONTRACT
./scripts/start.sh testnet
```

`start.sh` requires a typed confirmation because activation is irreversible.

Then verify:

1. countdown starts at 60
2. wallet A presses once and resets the clock
3. wallet A cannot press again, even in another browser/device
4. wallet B can press
5. correct faction is recorded based on execution time
6. recent press event appears in live tape
7. countdown reaches 0 if nobody presses
8. all future presses revert after 0
9. the ended UI has no restart path

### 4. Mainnet deployment

Only after testnet lifecycle closure:

```bash
export PRIVATE_KEY=0x...
export I_UNDERSTAND_MAINNET=YES
./scripts/deploy.sh mainnet
```

Configure the live address and deployment block, publish the frontend, verify it while SEALED, then activate separately:

```bash
export BUTTON_CONTRACT=0xLIVE_CONTRACT
export I_UNDERSTAND_MAINNET=YES
./scripts/start.sh mainnet
```

Do not activate before the public site is reachable. The first 60-second window begins immediately when `start()` is mined.

## Contract properties

- fixed 60-second window
- one press per wallet
- no payable functions
- no treasury
- no token gating
- no reward distribution
- no owner withdrawal
- no pause
- no reset
- no extension
- no upgradeability
- starter has exactly one privileged action: one-time activation
- `finalize()` is permissionless and only seals the historical ending after expiry; it cannot alter the outcome

## Frontend lifecycle states

The UI explicitly handles:

- preview / no contract
- sealed / not started
- live
- wallet disconnected
- wrong network
- signature rejected
- transaction pending
- transaction reverted
- wallet already spent its press
- RPC stale while preserving last-known state
- empty event tape
- ended forever

## Why `VITE_CONTRACT_DEPLOY_BLOCK` matters

Robinhood Chain produces blocks quickly. The live tape intentionally avoids scanning the entire chain on every browser load. Supplying the deployment block lets the interface query the exact event range. Canonical totals and faction counts are read from contract storage regardless.

## Static deployment

The `web/` folder can be deployed directly to Vercel, Netlify, Cloudflare Pages, GitHub Pages, or any ordinary static host. No server secrets are required by the frontend.

## Token relationship

The UI may display a configurable `BUTTON / RDDT` label and link to the token page. The experiment contract itself does not know the token address and does not inspect token balances. This separation is intentional.

## References

- Robinhood Chain documentation: `https://docs.robinhood.com/chain/connecting/`
- Robinhood contract deployment documentation: `https://docs.robinhood.com/chain/deploy-smart-contracts/`


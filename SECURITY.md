# Security notes

BUTTON is intentionally tiny. The experiment still has assumptions that should be explicit.

## What the contract enforces

- one successful press per wallet address
- a fixed 60-second window
- deterministic faction assignment from the remaining onchain time
- permanent expiry once the deadline is reached
- no privileged reset, pause, extension, withdrawal, fee, token gate, or upgrade after activation

## What it does not enforce

### One wallet is not one human

A person can control multiple wallets. BUTTON measures wallet behavior, not proof-of-personhood. Do not describe the result as one-human-one-press.

### Transaction ordering matters

The faction is determined when the transaction executes on Robinhood Chain. A user may click at 8 seconds but be included after another wallet has already reset the clock. The contract records the authoritative execution-time result.

### Block timestamp is the clock

The experiment uses `block.timestamp`, the standard EVM time source. The UI's hundredths animation is visual only. Canonical state is whole-second onchain time.

### RPC/indexer failure is not contract failure

The frontend preserves last-known state and marks it stale if RPC reads fail. Users should verify the contract directly on Blockscout during an outage.

## Operational risk

Activation is irreversible. Deploy the contract in the sealed state first, publish and verify the website, then call `start()` only when the public interface is ready.

## Before mainnet

- run the full Foundry test suite
- deploy to Robinhood Chain testnet
- run the complete live → press → reset → expiry lifecycle with multiple wallets
- verify the source code on Blockscout
- confirm the production frontend points at the exact verified address and deploy block
- independently review the contract; do not treat this repository as an audit

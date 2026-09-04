#!/usr/bin/env bash
# Deterministic local demo: boots a real local chain (anvil), deploys the exact
# ButtonExperiment contract from contracts/src using the same scripts production
# deploys use, activates it, submits one real press, proves the full onchain
# lifecycle by reading the deployed contract's own state after each step, then
# demonstrates the contract rejecting a second press from the same wallet — the
# same rejection path the production frontend explains as "ONE PRESS FOREVER".
#
# Every value this script prints is read back from the chain with `cast call`
# AFTER the transaction that caused it landed — never a value computed locally or
# claimed by a script's own simulation trace. (An earlier version of this script
# printed "before/after" values from inside a forge script that used `vm.warp` —
# that cheatcode only affects the script's local simulation, not the real broadcast
# transactions, so its printed numbers silently diverged from what actually landed
# on chain. Caught by cross-checking with `cast call` after the fact; fixed by
# moving every proof read here, after the real transaction, instead.)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RPC="http://127.0.0.1:8545"
ANVIL_LOG="$(mktemp -t button-anvil-log)"
ANVIL_PID_FILE="/tmp/button-demo-anvil.pid"

# Anvil's default first two accounts, derived from its default deterministic
# mnemonic ("test test test test test test test test test test test junk"). These
# are publicly known, funded-only-on-a-local-chain test keys — never use them
# anywhere real funds could reach them.
STARTER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
PRESSER_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
STARTER_ADDR="$(cast wallet address --private-key "$STARTER_KEY")"
PRESSER_ADDR="$(cast wallet address --private-key "$PRESSER_KEY")"

if lsof -iTCP:8545 -sTCP:LISTEN -P >/dev/null 2>&1; then
  echo "Port 8545 is already in use. Stop whatever's running there (a previous demo?" >&2
  echo "check $ANVIL_PID_FILE) before starting a new one." >&2
  exit 1
fi

echo "=== Starting local anvil chain ==="
anvil --port 8545 >"$ANVIL_LOG" 2>&1 &
ANVIL_PID=$!
echo "$ANVIL_PID" >"$ANVIL_PID_FILE"
echo "anvil pid $ANVIL_PID, log at $ANVIL_LOG"

cleanup_on_failure() {
  echo "Demo failed — stopping anvil (pid $ANVIL_PID)." >&2
  kill "$ANVIL_PID" 2>/dev/null || true
  rm -f "$ANVIL_PID_FILE"
}
trap cleanup_on_failure ERR

echo -n "Waiting for anvil to accept connections"
for _ in $(seq 1 30); do
  if cast block-number --rpc-url "$RPC" >/dev/null 2>&1; then
    echo " — ready."
    break
  fi
  echo -n "."
  sleep 0.5
done
if ! cast block-number --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "anvil never became reachable at $RPC" >&2
  exit 1
fi

echo ""
echo "=== DEPLOY (sealed) — using the real production deploy script ==="
cd "$ROOT/contracts"
PRIVATE_KEY="$STARTER_KEY" forge script script/Deploy.s.sol:DeployButtonExperiment --rpc-url "$RPC" --broadcast -v

DEPLOY_BROADCAST="$ROOT/contracts/broadcast/Deploy.s.sol/31337/run-latest.json"
CONTRACT_ADDRESS="$(jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress' "$DEPLOY_BROADCAST" | head -1)"
DEPLOY_BLOCK_HEX="$(jq -r '.receipts[] | select(.contractAddress != null) | .blockNumber' "$DEPLOY_BROADCAST" | head -1)"
DEPLOY_BLOCK="$(cast to-dec "$DEPLOY_BLOCK_HEX")"
if [[ -z "$CONTRACT_ADDRESS" || "$CONTRACT_ADDRESS" == "null" ]]; then
  echo "Could not determine the deployed contract address from $DEPLOY_BROADCAST" >&2
  exit 1
fi
echo "contract: $CONTRACT_ADDRESS (deploy block $DEPLOY_BLOCK)"
echo "sealed:   $(cast call "$CONTRACT_ADDRESS" 'started()(bool)' --rpc-url "$RPC") (started should be false)"

echo ""
echo "=== START (one-time activation) — using the real production start script ==="
PRIVATE_KEY="$STARTER_KEY" BUTTON_CONTRACT="$CONTRACT_ADDRESS" \
  forge script script/Start.s.sol:StartButtonExperiment --rpc-url "$RPC" --broadcast -v

DEADLINE_BEFORE="$(cast call "$CONTRACT_ADDRESS" 'deadline()(uint256)' --rpc-url "$RPC")"
echo "started:  $(cast call "$CONTRACT_ADDRESS" 'started()(bool)' --rpc-url "$RPC")"
echo "deadline: $DEADLINE_BEFORE"

echo ""
echo "=== INPUT: wallet presses ==="
echo "presser: $PRESSER_ADDR"

echo ""
echo "=== ATTEMPT: transaction submitted ==="
PRESS_TX="$(cast send "$CONTRACT_ADDRESS" 'press()' --private-key "$PRESSER_KEY" --rpc-url "$RPC" --json | jq -r '.transactionHash')"
echo "tx hash: $PRESS_TX"

echo ""
echo "=== CHAIN RESULT: transaction executed ==="
PRESS_STATUS="$(cast receipt "$PRESS_TX" --rpc-url "$RPC" --json | jq -r '.status')"
echo "receipt status: $PRESS_STATUS (0x1 = success)"
[[ "$PRESS_STATUS" == "0x1" ]] || { echo "DEMO INVARIANT VIOLATED: press transaction did not succeed" >&2; exit 1; }
HAS_PRESSED="$(cast call "$CONTRACT_ADDRESS" 'hasPressed(address)(bool)' "$PRESSER_ADDR" --rpc-url "$RPC")"
echo "hasPressed(presser): $HAS_PRESSED"
[[ "$HAS_PRESSED" == "true" ]] || { echo "DEMO INVARIANT VIOLATED: hasPressed is false after a successful press" >&2; exit 1; }

echo ""
echo "=== STATE CHANGE: deadline reset ==="
DEADLINE_AFTER="$(cast call "$CONTRACT_ADDRESS" 'deadline()(uint256)' --rpc-url "$RPC")"
echo "deadline before press: $DEADLINE_BEFORE"
echo "deadline after press:  $DEADLINE_AFTER"

echo ""
echo "=== IDENTITY: faction assigned ==="
FACTION="$(cast call "$CONTRACT_ADDRESS" 'pressFaction(address)(uint8)' "$PRESSER_ADDR" --rpc-url "$RPC")"
REMAINING="$(cast call "$CONTRACT_ADDRESS" 'pressRemaining(address)(uint8)' "$PRESSER_ADDR" --rpc-url "$RPC")"
PRESS_NUMBER="$(cast call "$CONTRACT_ADDRESS" 'pressNumber(address)(uint256)' "$PRESSER_ADDR" --rpc-url "$RPC")"
echo "faction id: $FACTION"
echo "remaining seconds at press: $REMAINING"
echo "press number: $PRESS_NUMBER"

echo ""
echo "=== PROOF: the Pressed event, decoded straight from the transaction receipt ==="
cast receipt "$PRESS_TX" --rpc-url "$RPC" | grep -A6 "^logs"
echo "totalPresses:  $(cast call "$CONTRACT_ADDRESS" 'totalPresses()(uint256)' --rpc-url "$RPC")"
echo "lastPresser:   $(cast call "$CONTRACT_ADDRESS" 'lastPresser()(address)' --rpc-url "$RPC")"
echo "closestCall:   $(cast call "$CONTRACT_ADDRESS" 'closestCall()(uint8)' --rpc-url "$RPC")s"
echo "explorer proof would normally be a block explorer link; locally, verify with:"
echo "  cast receipt $PRESS_TX --rpc-url $RPC"

echo ""
echo "=== CONTROLLED FAILURE: same wallet attempts a second press ==="
echo "Plain 'cast send' — mirrors exactly what a real wallet does: simulate before"
echo "submitting, and the node rejects the transaction before it's ever mined."
SECOND_PRESS_OUTPUT="$(cast send "$CONTRACT_ADDRESS" "press()" --private-key "$PRESSER_KEY" --rpc-url "$RPC" 2>&1)" && {
  echo "DEMO INVARIANT VIOLATED: the second press from the same wallet SUCCEEDED." >&2
  echo "$SECOND_PRESS_OUTPUT" >&2
  exit 1
} || true
echo "$SECOND_PRESS_OUTPUT"

ALREADY_PRESSED_SELECTOR="$(cast sig 'AlreadyPressed()')"
if echo "$SECOND_PRESS_OUTPUT" | grep -qi "${ALREADY_PRESSED_SELECTOR#0x}"; then
  echo ""
  echo "Rejected as expected: AlreadyPressed() ($ALREADY_PRESSED_SELECTOR)"
  echo "This is exactly what the frontend UI shows as: ONE PRESS FOREVER"
else
  echo "DEMO WARNING: the second press was rejected, but not with the expected" >&2
  echo "AlreadyPressed selector ($ALREADY_PRESSED_SELECTOR). Inspect the output above." >&2
  exit 1
fi

echo ""
echo "=== Writing web/public/config.js for the local network ==="
cd "$ROOT"
VITE_RH_NETWORK=local \
VITE_BUTTON_CONTRACT="$CONTRACT_ADDRESS" \
VITE_CONTRACT_DEPLOY_BLOCK="$DEPLOY_BLOCK" \
VITE_RH_RPC_URL="$RPC" \
  node scripts/configure.mjs

trap - ERR

echo ""
echo "=== Demo chain is live and stays running ==="
echo "contract:      $CONTRACT_ADDRESS"
echo "deploy block:  $DEPLOY_BLOCK"
echo "rpc:           $RPC"
echo "anvil pid:     $ANVIL_PID (log: $ANVIL_LOG)"
echo ""
echo "Next: cd web && npm run dev — then open the site and connect a wallet pointed"
echo "at http://127.0.0.1:8545 (chain id 31337). Import one of anvil's other default"
echo "accounts (printed in $ANVIL_LOG) to press with a fresh, unspent wallet — the"
echo "two accounts above already used their one press."
echo ""
echo "To stop the demo chain: kill \$(cat $ANVIL_PID_FILE)"

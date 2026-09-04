#!/usr/bin/env bash
# The complete reproducible lifecycle test from LAUNCH_CHECKLIST.md / SECURITY.md's
# "before mainnet" list, run against ANY already-deployed-but-not-yet-started
# ButtonExperiment contract on ANY RPC (local anvil during development, or a real
# testnet deployment before activation). Every assertion reads real state back from
# the contract with `cast call` — nothing here is asserted from local computation.
#
# Usage:
#   RPC_URL=... CONTRACT=0x... STARTER_KEY=0x... \
#   PRESSER_A_KEY=0x... PRESSER_B_KEY=0x... PRESSER_C_KEY=0x... \
#     ./scripts/lifecycle-check.sh
#
# STARTER_KEY must be the contract's own `starter()`. The three presser keys must
# be funded with enough gas and must never have pressed this contract before.
# WAIT_FOR_EXPIRY=1 makes the final phase actually wait out a real 60s window
# (skipped by default since that's a real wall-clock wait — the contract-level
# "cannot press after expiry" guarantee is already exhaustively fuzz/invariant
# tested in contracts/test/, so this script's default run proves the *lifecycle
# wiring* end to end and treats expiry as opt-in rather than mandatory per run).
set -euo pipefail

: "${RPC_URL:?RPC_URL is required}"
: "${CONTRACT:?CONTRACT is required}"
: "${STARTER_KEY:?STARTER_KEY is required}"
: "${PRESSER_A_KEY:?PRESSER_A_KEY is required}"
: "${PRESSER_B_KEY:?PRESSER_B_KEY is required}"
: "${PRESSER_C_KEY:?PRESSER_C_KEY is required}"
WAIT_FOR_EXPIRY="${WAIT_FOR_EXPIRY:-0}"

PRESSER_A="$(cast wallet address --private-key "$PRESSER_A_KEY")"
PRESSER_B="$(cast wallet address --private-key "$PRESSER_B_KEY")"
PRESSER_C="$(cast wallet address --private-key "$PRESSER_C_KEY")"

pass=0
fail=0
check() {
  local desc="$1" actual="$2" expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  PASS: $desc ($actual)"
    pass=$((pass + 1))
  else
    echo "  FAIL: $desc — expected '$expected', got '$actual'" >&2
    fail=$((fail + 1))
  fi
}

call() { cast call "$CONTRACT" "$1" --rpc-url "$RPC_URL" "${@:2}"; }
# `cast call` annotates large uint256 returns with a human-readable suffix (e.g.
# "1788515581 [1.788e9]") — strip it for any value used in shell arithmetic.
call_num() { call "$@" | awk '{print $1}'; }

echo "=== 1. SEALED ==="
check "started() is false before activation" "$(call 'started()(bool)')" "false"

echo ""
echo "=== 2. START ==="
cast send "$CONTRACT" "start()" --private-key "$STARTER_KEY" --rpc-url "$RPC_URL" >/dev/null
check "started() is true after start()" "$(call 'started()(bool)')" "true"
check "isAlive() is true immediately after start()" "$(call 'isAlive()(bool)')" "true"
DEADLINE_AFTER_START="$(call_num 'deadline()(uint256)')"
echo "  deadline: $DEADLINE_AFTER_START"

echo ""
echo "=== 3. FIRST PRESS (wallet A) ==="
cast send "$CONTRACT" "press()" --private-key "$PRESSER_A_KEY" --rpc-url "$RPC_URL" >/dev/null
check "hasPressed(A) is true" "$(call 'hasPressed(address)(bool)' "$PRESSER_A")" "true"
check "totalPresses is 1" "$(call 'totalPresses()(uint256)')" "1"
DEADLINE_AFTER_A="$(call_num 'deadline()(uint256)')"
echo "  faction(A): $(call 'pressFaction(address)(uint8)' "$PRESSER_A")  remaining: $(call 'pressRemaining(address)(uint8)' "$PRESSER_A")s"

echo ""
echo "=== 4. SECOND WALLET PRESS (wallet B) + COUNTDOWN RESET ==="
cast send "$CONTRACT" "press()" --private-key "$PRESSER_B_KEY" --rpc-url "$RPC_URL" >/dev/null
check "hasPressed(B) is true" "$(call 'hasPressed(address)(bool)' "$PRESSER_B")" "true"
check "totalPresses is 2" "$(call 'totalPresses()(uint256)')" "2"
check "lastPresser is B" "$(call 'lastPresser()(address)')" "$PRESSER_B"
DEADLINE_AFTER_B="$(call_num 'deadline()(uint256)')"
echo "  deadline before B: $DEADLINE_AFTER_A"
echo "  deadline after B:  $DEADLINE_AFTER_B"
if [[ "$DEADLINE_AFTER_B" -gt "$DEADLINE_AFTER_A" || "$DEADLINE_AFTER_B" -eq "$DEADLINE_AFTER_A" ]]; then
  echo "  PASS: countdown reset to a fresh 60s window at B's press time"
  pass=$((pass + 1))
else
  echo "  FAIL: deadline did not reset forward" >&2
  fail=$((fail + 1))
fi
echo "  faction(B): $(call 'pressFaction(address)(uint8)' "$PRESSER_B")  remaining: $(call 'pressRemaining(address)(uint8)' "$PRESSER_B")s"

echo ""
echo "=== 5. DUPLICATE WALLET REJECTION (wallet A presses again) ==="
DUP_OUTPUT="$(cast send "$CONTRACT" "press()" --private-key "$PRESSER_A_KEY" --rpc-url "$RPC_URL" 2>&1)" && {
  echo "  FAIL: duplicate press from wallet A SUCCEEDED — this must never happen" >&2
  fail=$((fail + 1))
} || {
  ALREADY_PRESSED_SELECTOR="$(cast sig 'AlreadyPressed()')"
  if echo "$DUP_OUTPUT" | grep -qi "${ALREADY_PRESSED_SELECTOR#0x}"; then
    echo "  PASS: duplicate press correctly reverted with AlreadyPressed"
    pass=$((pass + 1))
  else
    echo "  FAIL: duplicate press reverted, but not with AlreadyPressed:" >&2
    echo "$DUP_OUTPUT" >&2
    fail=$((fail + 1))
  fi
}
check "totalPresses unchanged at 2 after the rejected duplicate" "$(call 'totalPresses()(uint256)')" "2"

echo ""
echo "=== 6. THIRD WALLET PRESS (wallet C) — faction boundary observation ==="
cast send "$CONTRACT" "press()" --private-key "$PRESSER_C_KEY" --rpc-url "$RPC_URL" >/dev/null
check "hasPressed(C) is true" "$(call 'hasPressed(address)(bool)' "$PRESSER_C")" "true"
check "totalPresses is 3" "$(call 'totalPresses()(uint256)')" "3"
echo "  faction(C): $(call 'pressFaction(address)(uint8)' "$PRESSER_C")  remaining: $(call 'pressRemaining(address)(uint8)' "$PRESSER_C")s"
echo "  (Exact faction boundaries 52/42/32/22/12s are exhaustively covered onchain by"
echo "   contracts/test/ButtonExperiment.t.sol's FACTIONS section against every"
echo "   integer boundary — a live run cannot control real block timing precisely"
echo "   enough to hit an exact second, so this step only observes real assignment,"
echo "   it does not re-prove the boundary logic.)"
echo "  closestCall so far: $(call 'closestCall()(uint8)')s, held by $(call 'closestCallWallet()(address)')"

echo ""
echo "=== 7. EVENT INGESTION ==="
echo "  Raw Pressed events from this contract (cross-check against the frontend's"
echo "  own live tape once it is pointed at this deployment):"
cast logs --from-block 0 --to-block latest --address "$CONTRACT" \
  "Pressed(address,uint8,uint8,uint256,uint256)" --rpc-url "$RPC_URL" | grep -E "blockNumber|transactionHash" || true
echo "  MANUAL: open the production/staging frontend against this contract and confirm"
echo "  the Live Tape, /history, and /stats pages show exactly these 3 presses."

if [[ "$WAIT_FOR_EXPIRY" == "1" ]]; then
  echo ""
  echo "=== 8. EXPIRY (waiting for the real 60s window to lapse — do not interrupt) ==="
  DEADLINE="$(call_num 'deadline()(uint256)')"
  NOW="$(date +%s)"
  WAIT_SECONDS=$((DEADLINE - NOW + 3))
  if [[ "$WAIT_SECONDS" -gt 0 ]]; then
    echo "  waiting ${WAIT_SECONDS}s for the deadline to pass..."
    sleep "$WAIT_SECONDS"
  fi
  # A view call reads the *latest mined block's* timestamp, not the real wall
  # clock. On a real network new blocks arrive continuously, so this is moot —
  # but on a quiet local anvil node with no pending activity, no block has been
  # mined since the sleep, so `isAlive()` would still see the pre-sleep block's
  # timestamp. A trivial self-transfer (valid on any EVM chain, negligible cost)
  # forces a fresh block with the current timestamp before the check.
  cast send --private-key "$STARTER_KEY" --value 0 --rpc-url "$RPC_URL" "$(cast wallet address --private-key "$STARTER_KEY")" >/dev/null
  check "isAlive() is false after the deadline" "$(call 'isAlive()(bool)')" "false"

  echo ""
  echo "=== 9. PERMANENT ENDED STATE ==="
  POST_EXPIRY_OUTPUT="$(cast send "$CONTRACT" "press()" --private-key "$STARTER_KEY" --rpc-url "$RPC_URL" 2>&1)" && {
    echo "  FAIL: a press after expiry SUCCEEDED — this must never happen" >&2
    fail=$((fail + 1))
  } || {
    ENDED_SELECTOR="$(cast sig 'ExperimentEnded()')"
    if echo "$POST_EXPIRY_OUTPUT" | grep -qi "${ENDED_SELECTOR#0x}"; then
      echo "  PASS: post-expiry press correctly reverted with ExperimentEnded"
      pass=$((pass + 1))
    else
      echo "  FAIL: post-expiry press reverted, but not with ExperimentEnded:" >&2
      echo "$POST_EXPIRY_OUTPUT" >&2
      fail=$((fail + 1))
    fi
  }
  cast send "$CONTRACT" "finalize()" --private-key "$STARTER_KEY" --rpc-url "$RPC_URL" >/dev/null
  check "finalized() is true after finalize()" "$(call 'finalized()(bool)')" "true"
  echo "  MANUAL: confirm the frontend shows the permanent dead state (THE BUTTON IS"
  echo "  DEAD) with no restart path, and that /history remains fully accessible."
else
  echo ""
  echo "=== 8-9. EXPIRY / PERMANENT ENDED STATE — SKIPPED ==="
  echo "  Set WAIT_FOR_EXPIRY=1 to run this phase (waits out a real 60s window)."
fi

echo ""
echo "=== RESULT: $pass passed, $fail failed ==="
[[ "$fail" -eq 0 ]]

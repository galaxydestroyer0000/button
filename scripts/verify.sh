#!/usr/bin/env bash
# Verifies the deployed ButtonExperiment source on the network's Blockscout instance,
# using the exact verifier settings from Robinhood Chain's own deployment docs
# (https://docs.robinhood.com/chain/deploy-smart-contracts): Blockscout, API URL
# https://<explorer-host>/api/, matched by chain ID.
set -euo pipefail
MODE="${1:-testnet}"
CONTRACT_ADDRESS="${2:-${BUTTON_CONTRACT:-}}"
cd "$(dirname "$0")/../contracts"

if [[ -z "$CONTRACT_ADDRESS" ]]; then
  echo "Usage: $0 <testnet|mainnet> <contract_address>" >&2
  echo "   or: BUTTON_CONTRACT=0x... $0 <testnet|mainnet>" >&2
  exit 1
fi

if [[ "$MODE" == "mainnet" ]]; then
  CHAIN_ID=4663
  API_URL="https://robinhoodchain.blockscout.com/api/"
else
  CHAIN_ID=46630
  API_URL="https://explorer.testnet.chain.robinhood.com/api/"
fi

echo "Verifying $CONTRACT_ADDRESS on $MODE (chain $CHAIN_ID) via $API_URL"

# The constructor takes one argument (starter address) — forge needs the ABI-encoded
# constructor args to verify bytecode that matches exactly. Read it back from the
# deployed contract itself (`starter()` is a public immutable) rather than trusting
# an operator-typed value, so a mistyped arg can never produce a false verification.
STARTER="$(cast call "$CONTRACT_ADDRESS" "starter()(address)" --rpc-url "${RH_RPC_URL:-$([ "$MODE" = mainnet ] && echo https://rpc.mainnet.chain.robinhood.com || echo https://rpc.testnet.chain.robinhood.com)}")"
CONSTRUCTOR_ARGS="$(cast abi-encode "constructor(address)" "$STARTER")"

forge verify-contract "$CONTRACT_ADDRESS" src/ButtonExperiment.sol:ButtonExperiment \
  --chain-id "$CHAIN_ID" \
  --verifier blockscout \
  --verifier-url "$API_URL" \
  --constructor-args "$CONSTRUCTOR_ARGS" \
  --watch

echo ""
echo "Verify manually if the above did not confirm success:"
if [[ "$MODE" == "mainnet" ]]; then
  echo "  https://robinhoodchain.blockscout.com/address/$CONTRACT_ADDRESS#code"
else
  echo "  https://explorer.testnet.chain.robinhood.com/address/$CONTRACT_ADDRESS#code"
fi

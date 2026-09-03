#!/usr/bin/env bash
set -euo pipefail
MODE="${1:-testnet}"
cd "$(dirname "$0")/../contracts"

if [[ -z "${PRIVATE_KEY:-}" || -z "${BUTTON_CONTRACT:-}" ]]; then
  echo "PRIVATE_KEY and BUTTON_CONTRACT are required" >&2
  exit 1
fi

if [[ "$MODE" == "mainnet" ]]; then
  if [[ "${I_UNDERSTAND_MAINNET:-}" != "YES" ]]; then
    echo "Refusing mainnet activation. Set I_UNDERSTAND_MAINNET=YES explicitly." >&2
    exit 1
  fi
  RPC="${RH_MAINNET_RPC:-https://rpc.mainnet.chain.robinhood.com}"
else
  RPC="${RH_TESTNET_RPC:-https://rpc.testnet.chain.robinhood.com}"
fi

echo "WARNING: start() begins the irreversible 60-second experiment. There is no restart."
read -r -p "Type START BUTTON to continue: " answer
[[ "$answer" == "START BUTTON" ]] || { echo "Cancelled"; exit 1; }
forge script script/Start.s.sol:StartButtonExperiment --rpc-url "$RPC" --broadcast -vvvv

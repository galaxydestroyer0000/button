#!/usr/bin/env bash
set -euo pipefail
MODE="${1:-testnet}"
cd "$(dirname "$0")/../contracts"

if [[ -z "${PRIVATE_KEY:-}" ]]; then
  echo "PRIVATE_KEY is required" >&2
  exit 1
fi

if [[ "$MODE" == "mainnet" ]]; then
  if [[ "${I_UNDERSTAND_MAINNET:-}" != "YES" ]]; then
    echo "Refusing mainnet deploy. Set I_UNDERSTAND_MAINNET=YES explicitly." >&2
    exit 1
  fi
  RPC="${RH_MAINNET_RPC:-https://rpc.mainnet.chain.robinhood.com}"
  CHAIN=4663
else
  RPC="${RH_TESTNET_RPC:-https://rpc.testnet.chain.robinhood.com}"
  CHAIN=46630
fi

echo "Deploying ButtonExperiment to $MODE (chain $CHAIN). The experiment will remain SEALED after deployment."
forge script script/Deploy.s.sol:DeployButtonExperiment --rpc-url "$RPC" --broadcast -vvvv

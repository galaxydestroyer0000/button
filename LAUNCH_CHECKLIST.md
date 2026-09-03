# BUTTON launch checklist

## Token / story

- [ ] BUTTON token is live and the exact token address is recorded
- [ ] Pair label is `BUTTON / RDDT`
- [ ] Website copy does not promise rewards, yield, prizes, access, or an airdrop for pressing
- [ ] Token page links to the experiment site
- [ ] Experiment site links to the exact token page/address

## Testnet

- [ ] `forge test -vv` passes
- [ ] contract deployed to Robinhood Chain testnet (46630)
- [ ] source verified on testnet explorer
- [ ] web configured with testnet contract + deployment block
- [ ] sealed state verified publicly
- [ ] wrong-network switch tested
- [ ] wallet rejection tested
- [ ] wallet A press tested
- [ ] wallet A second press reverts
- [ ] wallet B press resets timer
- [ ] faction assignment verified at multiple ranges
- [ ] event tape matches explorer transactions
- [ ] RPC-stale state tested
- [ ] natural expiry tested
- [ ] post-expiry press reverts
- [ ] ended UI contains no restart path

## Mainnet pre-activation

- [ ] mainnet contract deployed on chain 4663 but NOT started
- [ ] source verified on Robinhood Chain Blockscout
- [ ] exact contract address reviewed by two people / twice
- [ ] deployment block recorded in web config
- [ ] production website published
- [ ] website displays correct mainnet chain ID and exact contract
- [ ] contract explorer link works
- [ ] token link points to exact BUTTON token
- [ ] site tested from desktop wallet
- [ ] site tested from mobile wallet browser
- [ ] social share text checked
- [ ] no preview-mode banner on production
- [ ] public announcement copy ready before activation

## Activation

- [ ] starter wallet has enough ETH for gas
- [ ] production website is healthy
- [ ] block explorer is healthy
- [ ] team is ready to watch the first minute
- [ ] call `./scripts/start.sh mainnet`
- [ ] immediately verify `started=true` and deadline on Blockscout
- [ ] verify production countdown matches chain
- [ ] do not redeploy or restart because activity looks slow — there is no second run

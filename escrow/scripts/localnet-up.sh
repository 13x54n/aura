#!/usr/bin/env bash
# One command: local solana-test-validator with aura_escrow deployed (upgradeable, authority =
# ~/.config/aura/escrow-authority.json), a 6-dp test mint, config + fee-wallet ATA, and the
# test players funded with SOL + 100 test USDC. No devnet/mainnet calls.
#   escrow/scripts/localnet-up.sh        # start (resets the ledger)
#   escrow/scripts/localnet-up.sh stop   # stop the validator
set -euo pipefail
cd "$(dirname "$0")/.."
RPC=http://127.0.0.1:8899
LEDGER=${AURA_LEDGER:-/tmp/aura-ledger}
K=~/.config/aura
if [[ "${1:-}" == "stop" ]]; then
  lsof -ti tcp:8899 | xargs kill 2>/dev/null && echo "validator stopped" || echo "no validator on 8899"
  exit 0
fi
if lsof -ti tcp:8899 >/dev/null; then echo "port 8899 busy — run '$0 stop' first" >&2; exit 1; fi
[[ -f target/deploy/aura_escrow.so ]] || anchor build
PID=$(solana-keygen pubkey $K/aura-escrow-program.json)
AUTH=$(solana-keygen pubkey $K/escrow-authority.json)
solana-test-validator --reset --quiet --ledger "$LEDGER" \
  --upgradeable-program "$PID" target/deploy/aura_escrow.so "$AUTH" > /tmp/aura-validator.log 2>&1 &
for i in $(seq 1 60); do
  solana cluster-version --url $RPC >/dev/null 2>&1 && break
  sleep 1
done
solana cluster-version --url $RPC >/dev/null
echo "validator up on $RPC (ledger $LEDGER, log /tmp/aura-validator.log), program $PID"
for k in escrow-authority test-mint-authority test-p1 test-p2 test-p3; do
  solana airdrop 10 "$(solana-keygen pubkey $K/$k.json)" --url $RPC >/dev/null
done
P1=$(solana-keygen pubkey $K/test-p1.json); P2=$(solana-keygen pubkey $K/test-p2.json); P3=$(solana-keygen pubkey $K/test-p3.json)
SOLANA_RPC=$RPC node scripts/devnet-setup.mjs --test-mint --fund "$P1,$P2,$P3" | tee /tmp/aura-localnet-setup.log
MINT=$(grep '^ESCROW_MINT=' /tmp/aura-localnet-setup.log | cut -d= -f2)
cat <<ENV

Match server env for localnet escrow:
  ESCROW_LIVE=1 SOLANA_RPC=$RPC ESCROW_MINT=$MINT \\
  ESCROW_AUTHORITY_KEYPAIR=$K/escrow-authority.json ESCROW_DEPOSIT_SECS=60 ESCROW_REFUND_AFTER_SECS=60
ENV

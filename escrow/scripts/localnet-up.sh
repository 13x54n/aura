#!/usr/bin/env bash
# One command: local solana-test-validator with aura_escrow deployed (upgradeable, authority =
# ~/.config/aura/escrow-authority.json), a 6-dp test mint, config + fee-wallet ATA, and the
# test players funded with SOL + 100 test USDC. No devnet/mainnet calls.
#   escrow/scripts/localnet-up.sh        # start (resets the ledger)
#   escrow/scripts/localnet-up.sh stop   # stop the validator this script started for $AURA_LEDGER (per-ledger pidfile)
set -euo pipefail
cd "$(dirname "$0")/.."
RPC=http://127.0.0.1:8899
LEDGER=${AURA_LEDGER:-/tmp/aura-ledger}
K=~/.config/aura
# Pidfile keyed by the ledger path (not inside it: --reset wipes the ledger dir at startup),
# so another agent's `stop` with a different AURA_LEDGER can never kill this validator.
LEDGER_ABS=$(mkdir -p "$(dirname "$LEDGER")" && cd "$(dirname "$LEDGER")" && pwd)/$(basename "$LEDGER")
PIDFILE=${AURA_VALIDATOR_PIDFILE:-/tmp/aura-validator-$(printf %s "$LEDGER_ABS" | shasum | cut -c1-12).pid}
# stop: kill only the validator this script started (recorded pid), never whatever holds :8899.
if [[ "${1:-}" == "stop" ]]; then
  if [[ -f "$PIDFILE" ]]; then
    VPID=$(cat "$PIDFILE")
    # Only if that pid is still a solana-test-validator on THIS ledger.
    if kill -0 "$VPID" 2>/dev/null && ps -p "$VPID" -o command= | grep -q solana-test-validator \
       && ps -p "$VPID" -o command= | grep -qF -- "--ledger $LEDGER"; then
      kill "$VPID"
      for i in $(seq 1 20); do kill -0 "$VPID" 2>/dev/null || break; sleep 0.5; done
      echo "validator $VPID stopped"
    else
      echo "recorded validator $VPID is not running on $LEDGER (left alone)"
    fi
    rm -f "$PIDFILE"
  else
    echo "no validator started by this script for $LEDGER ($PIDFILE missing)"
  fi
  exit 0
fi
# Refuse to start next to any running validator (ours or someone else's).
if RUNNING=$(pgrep -f solana-test-validator); then
  echo "a solana-test-validator is already running (pid $(echo $RUNNING | tr '\n' ' ')) — not starting another." >&2
  echo "If it's ours: $0 stop. Otherwise leave it alone." >&2
  exit 1
fi
if lsof -ti tcp:8899 >/dev/null; then echo "port 8899 is in use by something else — not starting." >&2; exit 1; fi
[[ -f target/deploy/aura_escrow.so ]] || anchor build
PID=$(solana-keygen pubkey $K/aura-escrow-program.json)
AUTH=$(solana-keygen pubkey $K/escrow-authority.json)
# nohup + disown so the validator outlives the shell that started it
nohup solana-test-validator --reset --quiet --ledger "$LEDGER" \
  --upgradeable-program "$PID" target/deploy/aura_escrow.so "$AUTH" > /tmp/aura-validator.log 2>&1 < /dev/null &
echo $! > "$PIDFILE"
disown || true
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

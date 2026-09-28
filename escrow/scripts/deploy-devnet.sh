#!/usr/bin/env bash
# Resumable devnet deploy of aura_escrow + on-chain IDL. Keys live in ~/.config/aura (never in git).
# Usage: SOLANA_RPC=https://devnet.helius-rpc.com/?api-key=... escrow/scripts/deploy-devnet.sh
set -euo pipefail
if [[ -z "${SOLANA_RPC:-}" || "$SOLANA_RPC" =~ ^https?://api\.devnet\.solana\.com/?$ || "$SOLANA_RPC" == *mainnet* ]]; then
  echo "!!!! Set SOLANA_RPC to a dedicated DEVNET RPC (not api.devnet.solana.com, not mainnet). Aborting. !!!!" >&2
  exit 1
fi
cd "$(dirname "$0")/.."
K=~/.config/aura
AUTH=$K/escrow-authority.json
PROG=$K/aura-escrow-program.json
BUF=$K/deploy-buffer.json
SO=target/deploy/aura_escrow.so
PID=$(solana-keygen pubkey "$PROG")
echo "program $PID  authority $(solana-keygen pubkey "$AUTH")  buffer $(solana-keygen pubkey "$BUF")"
solana balance "$(solana-keygen pubkey "$AUTH")" --url "$SOLANA_RPC"
# 1) write (re-running resumes into the same buffer keypair)
solana program write-buffer "$SO" --buffer "$BUF" --buffer-authority "$AUTH" --keypair "$AUTH" \
  --url "$SOLANA_RPC" --with-compute-unit-price 10000 --max-sign-attempts 30
# 2) deploy from the buffer
solana program deploy --buffer "$(solana-keygen pubkey "$BUF")" --program-id "$PROG" \
  --upgrade-authority "$AUTH" --keypair "$AUTH" --url "$SOLANA_RPC" --with-compute-unit-price 10000
solana program show "$PID" --url "$SOLANA_RPC"
# 3) IDL on-chain
anchor idl init --filepath target/idl/aura_escrow.json "$PID" \
  --provider.cluster "$SOLANA_RPC" --provider.wallet "$AUTH" || \
anchor idl upgrade --filepath target/idl/aura_escrow.json "$PID" \
  --provider.cluster "$SOLANA_RPC" --provider.wallet "$AUTH"
echo "IDL account: $(anchor idl fetch "$PID" --provider.cluster "$SOLANA_RPC" >/dev/null 2>&1 && echo ok)"
# 4) hashes (no Docker needed)
solana-verify get-executable-hash "$SO"
solana-verify get-program-hash -u "$SOLANA_RPC" "$PID"
echo "explorer: https://explorer.solana.com/address/$PID?cluster=devnet"

#!/usr/bin/env bash
# Resumable devnet deploy of aura_escrow + on-chain IDL. Keys live in ~/.config/aura (never in git).
# Usage: SOLANA_RPC=https://devnet.helius-rpc.com/?api-key=... escrow/scripts/deploy-devnet.sh
# Orphaned buffers (e.g. from an interrupted plain `solana program deploy`): close them by
# ADDRESS only, never with --buffers (that closes every buffer the key owns):
#   solana program close <BUFFER_ADDRESS> --authority ~/.config/aura/escrow-authority.json \
#     --keypair ~/.config/aura/escrow-authority.json --url "$SOLANA_RPC"
set -euo pipefail
# Same URL guard as server/escrow.mjs (parses the URL; blocks public devnet/mainnet hosts,
# any case/query string, and the d/m/devnet/mainnet/mainnet-beta shorthands).
node --input-type=module -e "import { rpcProblem } from '$(cd "$(dirname "$0")/../.." && pwd)/server/escrow.mjs'; const p = rpcProblem(process.env.SOLANA_RPC); if (p) { console.error('!!!! ' + p + ' — set SOLANA_RPC to a dedicated DEVNET RPC. Aborting. !!!!'); process.exit(1); }"
cd "$(dirname "$0")/.."
K=~/.config/aura
AUTH=$K/escrow-authority.json
PROG=$K/aura-escrow-program.json
BUF=$K/deploy-buffer.json
SO=target/deploy/aura_escrow.so
# Buffer keypair: created once so an interrupted write resumes into the same buffer.
[[ -f "$BUF" ]] || { solana-keygen new --no-bip39-passphrase -s -o "$BUF" >/dev/null; chmod 600 "$BUF"; }
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

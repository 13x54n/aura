# aura_escrow build hashes (for the devnet deploy check)

Fresh `anchor build` on 2026-09-28 19:31 EDT (the .so mtime: `stat -f %Sm target/deploy/aura_escrow.so`) from program source identical to commit 5c8d57f
(`git diff 5c8d57f HEAD -- escrow/programs` is empty). Rebuilt from scratch (old .so moved away,
lib.rs touched); the result is byte-identical to the .so the LiteSVM tests used before.

| What | Value |
|---|---|
| sha256 target/deploy/aura_escrow.so | `497e26c9b7fe36a4e8ee81d7558c11b67033292951117b3aab37425020b76ac3` |
| solana-verify get-executable-hash | `19692d2388214386c27ac4995c538eb51c676dc6be399de2dbbf5fb43f8f2043` |
| size (bytes) | 426360 |
| program id | Df1YjMHGeeXVvayPHX7Vb5svqUkV3dbdfKU9D4UZ4m2 |
| toolchain | anchor-cli 0.32.1, solana-cli 2.3.13, rustc 1.98.1 |

After deploying to devnet, compare with:

    solana-verify get-program-hash -u <HELIUS_DEVNET_RPC> Df1YjMHGeeXVvayPHX7Vb5svqUkV3dbdfKU9D4UZ4m2

It must equal the executable hash above (the on-chain account is padded, so compare the
executable hash, not the file sha256). Non-verifiable local build (no Docker), so this hash
is for "what we deployed is what we tested", not a reproducible-build proof.

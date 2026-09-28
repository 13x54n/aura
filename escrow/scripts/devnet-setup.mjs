// One-time devnet setup for aura_escrow (idempotent). Keys stay in ~/.config/aura (never in git).
// Also used for localnet: SOLANA_RPC=http://127.0.0.1:8899 (see localnet-up.sh).
// Requires SOLANA_RPC = a dedicated devnet RPC (never the public api.devnet.solana.com).
//   SOLANA_RPC=https://devnet.helius-rpc.com/?api-key=... node escrow/scripts/devnet-setup.mjs
//   node escrow/scripts/devnet-setup.mjs --test-mint  # also create/config a 6-dp test mint (aUSD)
import { createRequire } from "module";
import { existsSync } from "fs";
import * as E from "../../server/escrow.mjs";
const require = createRequire(new URL("../../server/package.json", import.meta.url));
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } = require("@solana/web3.js");

const RPC = E.requireRpc();
if (!RPC) process.exit(1);
const dir = (process.env.HOME || "") + "/.config/aura/";
const admin = E.loadKeypair(process.env.ESCROW_AUTHORITY_KEYPAIR || dir + "escrow-authority.json");
const feeWallet = E.loadKeypair(dir + "fee-wallet.json").publicKey; // pubkey only is needed
const conn = new Connection(RPC, "confirmed");
const PROGRAM_ID = new PublicKey(process.env.ESCROW_PROGRAM_ID || E.DEFAULT_PROGRAM_ID);
const send = (ixs, signers) => sendAndConfirmTransaction(conn, new Transaction().add(...ixs), signers, { commitment: "confirmed" });

async function ensureConfig(mint) {
  if (!(await conn.getAccountInfo(mint))) {
    console.log(`mint ${mint.toBase58()} not on this cluster — skipping its config`);
    return;
  }
  const treasury = E.ata(feeWallet, mint);
  const cfg = E.configPda(PROGRAM_ID, mint);
  if (await conn.getAccountInfo(cfg)) {
    console.log(`config exists ${cfg.toBase58()} (mint ${mint.toBase58()})`);
  } else {
    const sig = await send([
      E.createAtaIdempotentIx(admin.publicKey, feeWallet, mint),
      E.initConfigIx({ programId: PROGRAM_ID, admin: admin.publicKey, mint, treasury, settleAuthority: admin.publicKey }),
    ], [admin]);
    console.log(`init_config ${cfg.toBase58()} mint ${mint.toBase58()} sig ${sig}`);
  }
  console.log(`  treasury (fee wallet ${feeWallet.toBase58()} ATA) ${treasury.toBase58()}`);
}

await ensureConfig(new PublicKey(E.CIRCLE_DEVNET_USDC));

if (process.argv.includes("--test-mint")) {
  const mintPath = dir + "test-mint.json";
  const mintAuth = E.loadKeypair(dir + "test-mint-authority.json");
  let mintKp;
  if (existsSync(mintPath)) mintKp = E.loadKeypair(mintPath);
  else {
    mintKp = Keypair.generate();
    (await import("fs")).writeFileSync(mintPath, JSON.stringify(Array.from(mintKp.secretKey)), { mode: 0o600 });
  }
  if (!(await conn.getAccountInfo(mintKp.publicKey))) {
    const data = Buffer.alloc(35); data[0] = 20; data[1] = 6; mintAuth.publicKey.toBuffer().copy(data, 2); data[34] = 0;
    const lamports = await conn.getMinimumBalanceForRentExemption(82);
    const sig = await send([
      SystemProgram.createAccount({ fromPubkey: admin.publicKey, newAccountPubkey: mintKp.publicKey, lamports, space: 82, programId: E.TOKEN_PROGRAM_ID }),
      new TransactionInstruction({ programId: E.TOKEN_PROGRAM_ID, keys: [{ pubkey: mintKp.publicKey, isSigner: false, isWritable: true }], data }),
    ], [admin, mintKp]);
    console.log(`test mint ${mintKp.publicKey.toBase58()} created sig ${sig}`);
  } else console.log(`test mint ${mintKp.publicKey.toBase58()} exists`);
  await ensureConfig(mintKp.publicKey);
  // --fund a,b,c : mint 100 test USDC to each wallet's ATA (test mint only).
  const fi = process.argv.indexOf("--fund");
  if (fi > 0 && process.argv[fi + 1]) {
    for (const w of process.argv[fi + 1].split(",")) {
      const owner = new PublicKey(w);
      const data = Buffer.alloc(9); data[0] = 7; data.writeBigUInt64LE(100_000_000n, 1);
      const sig = await send([
        E.createAtaIdempotentIx(admin.publicKey, owner, mintKp.publicKey),
        new TransactionInstruction({ programId: E.TOKEN_PROGRAM_ID, data, keys: [
          { pubkey: mintKp.publicKey, isSigner: false, isWritable: true },
          { pubkey: E.ata(owner, mintKp.publicKey), isSigner: false, isWritable: true },
          { pubkey: mintAuth.publicKey, isSigner: true, isWritable: false }] }),
      ], [admin, mintAuth]);
      console.log(`  funded ${w} with 100 test USDC (${sig.slice(0, 12)}…)`);
    }
  }
  console.log(`ESCROW_MINT=${mintKp.publicKey.toBase58()}`);
}

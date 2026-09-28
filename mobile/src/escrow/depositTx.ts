/**
 * Escrow deposit transaction, built on the phone. The player's wallet is the fee payer and
 * the ONLY signer (seats are bound at init_room, so there is no server co-signature).
 * Pure: no React Native imports (node unit tests import this file directly).
 */
import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Buffer } from "buffer";

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ATA_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const SLOT_HASHES_ID = new PublicKey("SysvarS1otHashes111111111111111111111111111");
export const COMPUTE_BUDGET_ID = new PublicKey("ComputeBudget111111111111111111111111111111");
/** Anchor discriminator: sha256("global:deposit")[0..8]. Checked against the server in tests. */
export const DEPOSIT_DISC = Buffer.from("f223c68952e1f2b6", "hex");

const pk = (x: PublicKey | string) => (typeof x === "string" ? new PublicKey(x) : x);

export const ata = (owner: PublicKey | string, mint: PublicKey | string) =>
  PublicKey.findProgramAddressSync([pk(owner).toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), pk(mint).toBuffer()], ATA_PROGRAM_ID)[0];
export const configPda = (programId: PublicKey | string, mint: PublicKey | string) =>
  PublicKey.findProgramAddressSync([Buffer.from("config"), pk(mint).toBuffer()], pk(programId))[0];

export type DepositParams = {
  programId: string;
  mint: string;
  room: string;
  chainSeat: number;
  player: string;
};

export function depositIx(p: DepositParams): TransactionInstruction {
  const player = pk(p.player);
  return new TransactionInstruction({
    programId: pk(p.programId),
    keys: [
      { pubkey: player, isSigner: true, isWritable: false },
      { pubkey: configPda(p.programId, p.mint), isSigner: false, isWritable: false },
      { pubkey: pk(p.mint), isSigner: false, isWritable: false },
      { pubkey: pk(p.room), isSigner: false, isWritable: true },
      { pubkey: ata(player, p.mint), isSigner: false, isWritable: true },
      { pubkey: ata(p.room, p.mint), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SLOT_HASHES_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DEPOSIT_DISC, Buffer.from([p.chainSeat & 0xff])]),
  });
}

/** Unsigned deposit tx with a blockhash fetched right before the wallet prompt. */
export function buildDepositTx(p: DepositParams & { blockhash: string; lastValidBlockHeight?: number }): Transaction {
  const tx = new Transaction({
    feePayer: pk(p.player),
    blockhash: p.blockhash,
    lastValidBlockHeight: p.lastValidBlockHeight ?? 0,
  });
  tx.add(depositIx(p));
  return tx;
}

/**
 * Check what the wallet handed back before we submit it: fee payer is the player, the player
 * is the only signer and has a valid signature, and our deposit instruction is intact
 * (compute-budget instructions a wallet may add are allowed, nothing else).
 */
export function verifySignedDeposit(signed: Transaction, p: DepositParams): string | null {
  const player = pk(p.player);
  if (!signed.feePayer || !signed.feePayer.equals(player)) return "fee payer is not your wallet";
  const msg = signed.compileMessage();
  if (msg.header.numRequiredSignatures !== 1 || !msg.accountKeys[0].equals(player)) return "unexpected extra signer";
  if (signed.signatures.length !== 1 || !signed.signatures[0].signature) return "wallet signature missing";
  if (!signed.verifySignatures()) return "bad wallet signature";
  const want = depositIx(p);
  let found = 0;
  for (const ix of signed.instructions) {
    if (ix.programId.equals(COMPUTE_BUDGET_ID)) continue;
    const same =
      ix.programId.equals(want.programId) &&
      Buffer.from(ix.data).equals(Buffer.from(want.data)) &&
      ix.keys.length === want.keys.length &&
      ix.keys.every((k, i) => k.pubkey.equals(want.keys[i].pubkey));
    if (!same) return "transaction was changed";
    found++;
  }
  return found === 1 ? null : "deposit instruction missing";
}

/** Send failures that mean "rebuild with a fresh blockhash and re-prompt the wallet". */
export function isBlockhashError(err: unknown): boolean {
  const m = String((err as any)?.message ?? err ?? "");
  return /blockhash not found|BlockhashNotFound|block height exceeded|TransactionExpiredBlockheightExceeded|has expired|expired blockhash/i.test(
    m + " " + ((err as any)?.name ?? "")
  );
}


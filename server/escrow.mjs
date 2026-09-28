/**
 * aura_escrow client for the match server (devnet).
 * - Instruction builders (hand-encoded Anchor layout; IDL at escrow/target/idl/aura_escrow.json)
 * - EscrowService: init_room / read room / settle / refund, signed by the settle authority.
 * The server never custodies funds: the vault is the Room PDA's token account and the
 * program only pays seated depositors (+ the fee treasury).
 */
import { createHash, randomBytes } from "crypto";
import { readFileSync } from "fs";
import { homedir } from "os";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

export const DEFAULT_PROGRAM_ID = "Df1YjMHGeeXVvayPHX7Vb5svqUkV3dbdfKU9D4UZ4m2";
export const CIRCLE_DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ATA_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const UPGRADEABLE_LOADER_ID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
export const FEE_BPS = 500;
export const ROOM_OPEN = 0;
export const ROOM_LOCKED = 1;

const sha256 = (...parts) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest();
};
const disc = (name) => sha256(`global:${name}`).subarray(0, 8);
const u8 = (n) => Buffer.from([n & 0xff]);
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const i64 = (n) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n)); return b; };
const bytes = (b, len) => {
  const buf = Buffer.from(b);
  if (buf.length !== len) throw new Error(`expected ${len} bytes, got ${buf.length}`);
  return buf;
};
const pk = (x) => (x instanceof PublicKey ? x : new PublicKey(x));
const w = (pubkey, isSigner = false) => ({ pubkey: pk(pubkey), isSigner, isWritable: true });
const r = (pubkey, isSigner = false) => ({ pubkey: pk(pubkey), isSigner, isWritable: false });

/** Public devnet RPC rate-limits the whole IP (it blanked Lex's app balances). Never default to it. */
export const PUBLIC_DEVNET_RPC = /^https?:\/\/api\.devnet\.solana\.com\/?$/i;
export function requireRpc(env = process.env) {
  const rpc = (env.SOLANA_RPC || "").trim();
  if (!rpc || PUBLIC_DEVNET_RPC.test(rpc) || /mainnet/i.test(rpc)) {
    const why = !rpc ? "SOLANA_RPC is not set" : /mainnet/i.test(rpc) ? "SOLANA_RPC points at mainnet" : "SOLANA_RPC is the public devnet endpoint";
    console.error(`\n!!!! aura escrow: ${why}. Set SOLANA_RPC to a dedicated DEVNET RPC (e.g. Helius). Refusing to hit api.devnet.solana.com. !!!!\n`);
    return null;
  }
  return rpc;
}

export const explorerTx = (sig, cluster = "devnet") => `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;
export const ata = (owner, mint) =>
  PublicKey.findProgramAddressSync([pk(owner).toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), pk(mint).toBuffer()], ATA_PROGRAM_ID)[0];
export const configPda = (programId, mint) =>
  PublicKey.findProgramAddressSync([Buffer.from("config"), pk(mint).toBuffer()], pk(programId))[0];
export const roomPda = (programId, roomId) =>
  PublicKey.findProgramAddressSync([Buffer.from("room"), bytes(roomId, 16)], pk(programId))[0];
export const programDataPda = (programId) =>
  PublicKey.findProgramAddressSync([pk(programId).toBuffer()], UPGRADEABLE_LOADER_ID)[0];
export const diceCommit = (seed) => sha256(bytes(seed, 32));

/** Associated token account create (idempotent) — payer covers rent only if missing. */
export function createAtaIdempotentIx(payer, owner, mint) {
  return new TransactionInstruction({
    programId: ATA_PROGRAM_ID,
    keys: [w(payer, true), w(ata(owner, mint)), r(owner), r(mint), r(SystemProgram.programId), r(TOKEN_PROGRAM_ID)],
    data: Buffer.from([1]),
  });
}

export function initConfigIx({ programId, admin, mint, treasury, settleAuthority, feeBps = FEE_BPS }) {
  return new TransactionInstruction({
    programId: pk(programId),
    keys: [
      w(admin, true), w(configPda(programId, mint)), r(mint), r(treasury), r(programId),
      r(programDataPda(programId)), r(SystemProgram.programId),
    ],
    data: Buffer.concat([disc("init_config"), pk(settleAuthority).toBuffer(), u16(feeBps)]),
  });
}

export function updateConfigIx({ programId, admin, mint, settleAuthority, paused }) {
  return new TransactionInstruction({
    programId: pk(programId),
    keys: [r(admin, true), w(configPda(programId, mint))],
    data: Buffer.concat([disc("update_config"), pk(settleAuthority).toBuffer(), u8(paused ? 1 : 0)]),
  });
}

/** `players` = wallet bound to each seat (length = seats; null/undefined = unassigned). */
export function initRoomIx({ programId, authority, mint, roomId, stake, seats, commit, depositDeadline, refundAfterSecs, players = [] }) {
  const bound = Buffer.concat([0, 1, 2, 3].map((i) => (players[i] ? pk(players[i]).toBuffer() : Buffer.alloc(32))));
  const room = roomPda(programId, roomId);
  return new TransactionInstruction({
    programId: pk(programId),
    keys: [
      w(authority, true), r(configPda(programId, mint)), r(mint), w(room), w(ata(room, mint)),
      r(TOKEN_PROGRAM_ID), r(ATA_PROGRAM_ID), r(SystemProgram.programId),
    ],
    data: Buffer.concat([
      disc("init_room"), bytes(roomId, 16), u64(stake), u8(seats), bytes(commit, 32),
      i64(depositDeadline), i64(refundAfterSecs), bound,
    ]),
  });
}

/** Player-signed. `playerToken` defaults to the player's ATA. */
export function depositIx({ programId, player, mint, room, seat, playerToken }) {
  return new TransactionInstruction({
    programId: pk(programId),
    keys: [
      r(player, true), r(configPda(programId, mint)), r(mint), w(room),
      w(playerToken ?? ata(player, mint)), w(ata(room, mint)), r(TOKEN_PROGRAM_ID),
    ],
    data: Buffer.concat([disc("deposit"), u8(seat)]),
  });
}

export function settleIx({ programId, authority, mint, room, treasury, payer, winnerToken, winnerSeat, resultHash, seed }) {
  return new TransactionInstruction({
    programId: pk(programId),
    keys: [
      r(authority, true), r(configPda(programId, mint)), r(mint), w(room), w(ata(room, mint)),
      w(winnerToken), w(treasury), w(payer), r(TOKEN_PROGRAM_ID),
    ],
    data: Buffer.concat([disc("settle"), u8(winnerSeat), bytes(resultHash, 32), bytes(seed, 32)]),
  });
}

/** `recipients` = one token account per deposited seat, in seat order. */
export function refundIx({ programId, caller, mint, room, treasury, payer, recipients }) {
  return new TransactionInstruction({
    programId: pk(programId),
    keys: [
      r(caller, true), r(configPda(programId, mint)), r(mint), w(room), w(ata(room, mint)),
      w(treasury), w(payer), r(TOKEN_PROGRAM_ID), ...recipients.map((x) => w(x)),
    ],
    data: disc("refund"),
  });
}

const accountDisc = (name) => sha256(`account:${name}`).subarray(0, 8);
export function decodeRoom(data) {
  const b = Buffer.from(data);
  if (b.length < 8 || !b.subarray(0, 8).equals(accountDisc("Room"))) return null;
  let o = 8;
  const key = () => { const k = new PublicKey(b.subarray(o, o + 32)); o += 32; return k; };
  const config = key();
  const payer = key();
  const roomId = b.subarray(o, o + 16); o += 16;
  const stake = b.readBigUInt64LE(o); o += 8;
  const seats = b[o++], deposited = b[o++], status = b[o++], bump = b[o++];
  const players = [key(), key(), key(), key()];
  const diceCommit = b.subarray(o, o + 32); o += 32;
  const depositDeadline = Number(b.readBigInt64LE(o)); o += 8;
  const settleDeadline = Number(b.readBigInt64LE(o)); o += 8;
  const refundAfterSecs = Number(b.readBigInt64LE(o)); o += 8;
  return { config, payer, roomId, stake, seats, deposited, status, bump, players, diceCommit, depositDeadline, settleDeadline, refundAfterSecs };
}

export function decodeConfig(data) {
  const b = Buffer.from(data);
  if (b.length < 8 || !b.subarray(0, 8).equals(accountDisc("Config"))) return null;
  let o = 8;
  const key = () => { const k = new PublicKey(b.subarray(o, o + 32)); o += 32; return k; };
  const admin = key(), settleAuthority = key(), mint = key(), treasury = key();
  const feeBps = b.readUInt16LE(o); o += 2;
  return { admin, settleAuthority, mint, treasury, feeBps, paused: b[o] === 1, bump: b[o + 1] };
}

/** Anchor events from "Program data:" log lines. */
const EVENTS = ["Deposited", "RoomLocked", "Settled", "Refunded"].map((n) => [n, sha256(`event:${n}`).subarray(0, 8)]);
export function parseEvents(logs = []) {
  const out = [];
  for (const l of logs) {
    if (!l.startsWith("Program data: ")) continue;
    const b = Buffer.from(l.slice(14), "base64");
    const hit = EVENTS.find(([, d]) => b.subarray(0, 8).equals(d));
    if (!hit) continue;
    const ev = { name: hit[0] };
    if (hit[0] === "Settled") {
      let o = 8;
      ev.roomId = b.subarray(o, o + 16).toString("hex"); o += 16;
      ev.room = new PublicKey(b.subarray(o, o + 32)).toBase58(); o += 32;
      ev.winner = new PublicKey(b.subarray(o, o + 32)).toBase58(); o += 32;
      ev.winnerSeat = b[o++];
      ev.pot = b.readBigUInt64LE(o); o += 8;
      ev.fee = b.readBigUInt64LE(o); o += 8;
      ev.payout = b.readBigUInt64LE(o); o += 8;
      ev.resultHash = b.subarray(o, o + 32).toString("hex"); o += 32;
      ev.diceSeed = b.subarray(o, o + 32).toString("hex");
    }
    out.push(ev);
  }
  return out;
}

/** Fee math (mirrors the program): fee = pot * bps / 10_000 rounded down. */
export function payoutFor(stakeBase, seats, feeBps = FEE_BPS) {
  const pot = BigInt(stakeBase) * BigInt(seats);
  const fee = (pot * BigInt(feeBps)) / 10_000n;
  return { pot, fee, payout: pot - fee };
}

export function loadKeypair(path) {
  const p = path.startsWith("~") ? homedir() + path.slice(1) : path;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
}

/** Server side of the room vault. Only the settle authority key is held here. */
export class EscrowService {
  constructor({ rpc, programId, mint, authority, refundAfterSecs, depositWindowSecs, log = console }) {
    this.conn = new Connection(rpc, "confirmed");
    this.rpc = rpc;
    this.programId = pk(programId);
    this.mint = pk(mint);
    this.authority = authority;
    this.refundAfterSecs = refundAfterSecs;
    this.depositWindowSecs = depositWindowSecs;
    this.log = log;
    this.ready = false;
  }

  static fromEnv(env = process.env, log = console) {
    const keyPath = env.ESCROW_AUTHORITY_KEYPAIR;
    if (!keyPath) return null;
    const rpc = requireRpc(env);
    if (!rpc) return null; // staked rooms stay off
    const clamp = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Number(v) || d));
    return new EscrowService({
      rpc,
      programId: env.ESCROW_PROGRAM_ID || DEFAULT_PROGRAM_ID,
      mint: env.ESCROW_MINT || CIRCLE_DEVNET_USDC,
      authority: loadKeypair(keyPath),
      refundAfterSecs: clamp(env.ESCROW_REFUND_AFTER_SECS, 60, 7200, 7200),
      depositWindowSecs: clamp(env.ESCROW_DEPOSIT_SECS, 30, 86400, 180),
      log,
    });
  }

  /** Reads the on-chain config + mint so the server refuses to run half-configured. */
  async init() {
    if (!requireRpc({ SOLANA_RPC: this.rpc })) throw new Error("escrow: dedicated devnet SOLANA_RPC required");
    const [cfgInfo, mintInfo] = await Promise.all([
      this.conn.getAccountInfo(configPda(this.programId, this.mint)),
      this.conn.getParsedAccountInfo(this.mint),
    ]);
    const cfg = cfgInfo && decodeConfig(cfgInfo.data);
    if (!cfg) throw new Error(`escrow: no config for mint ${this.mint.toBase58()} (run escrow/scripts/devnet-setup.mjs)`);
    if (!cfg.settleAuthority.equals(this.authority.publicKey)) throw new Error("escrow: ESCROW_AUTHORITY_KEYPAIR is not the settle authority");
    const decimals = mintInfo.value?.data?.parsed?.info?.decimals;
    if (typeof decimals !== "number") throw new Error("escrow: mint not found");
    this.config = cfg;
    this.decimals = decimals;
    this.treasury = cfg.treasury;
    this.feeBps = cfg.feeBps;
    this.ready = true;
    return this;
  }

  toBase(ui) {
    return BigInt(Math.round(Number(ui) * 10 ** this.decimals));
  }
  toUi(base) {
    return Number(base) / 10 ** this.decimals;
  }

  async send(ixs, label) {
    const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), ...ixs);
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { blockhash, lastValidBlockHeight } = await this.conn.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = this.authority.publicKey;
        tx.signatures = [];
        tx.sign(this.authority);
        const sig = await this.conn.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
        const res = await this.conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
        if (res.value.err) throw new Error(`${label} failed: ${JSON.stringify(res.value.err)}`);
        return sig;
      } catch (e) {
        lastErr = e;
        // A program error won't fix itself; only retry transport / blockhash trouble.
        if (/custom program error|failed: \{/.test(String(e?.message))) break;
        await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  /** Server pays rent for Room + vault (returned when they close). */
  /** `players[i]` = wallet bound to chain seat i (only it can fund that seat). */
  async initRoom({ seats, stakeUi, players }) {
    const roomId = randomBytes(16);
    const seed = randomBytes(32);
    const commit = diceCommit(seed);
    const stake = this.toBase(stakeUi);
    const now = Math.floor(Date.now() / 1000);
    const depositDeadline = now + this.depositWindowSecs;
    const sig = await this.send(
      [initRoomIx({
        programId: this.programId, authority: this.authority.publicKey, mint: this.mint, roomId, stake, seats,
        commit, depositDeadline, refundAfterSecs: this.refundAfterSecs, players,
      })],
      "init_room"
    );
    const room = roomPda(this.programId, roomId);
    return { roomId, seed, commit, stake, room, vault: ata(room, this.mint), depositDeadline, sig };
  }

  async fetchRoom(room) {
    const info = await this.conn.getAccountInfo(pk(room), "confirmed");
    return info ? decodeRoom(info.data) : null;
  }

  async settle({ room, winnerSeat, resultHash, seed }) {
    const st = await this.fetchRoom(room);
    if (!st) throw new Error("settle: room account missing");
    const winner = st.players[winnerSeat];
    const sig = await this.send(
      [
        createAtaIdempotentIx(this.authority.publicKey, winner, this.mint),
        settleIx({
          programId: this.programId, authority: this.authority.publicKey, mint: this.mint, room,
          treasury: this.treasury, payer: st.payer, winnerToken: ata(winner, this.mint), winnerSeat, resultHash, seed,
        }),
      ],
      "settle"
    );
    const { pot, fee, payout } = payoutFor(st.stake, st.seats, this.feeBps);
    return { sig, url: explorerTx(sig), winner: winner.toBase58(), pot, fee, payout };
  }

  /** Refund every deposit to its own depositor's ATA (created if the player closed it). */
  async refund({ room }) {
    const st = await this.fetchRoom(room);
    if (!st) return null; // already closed (settled or refunded)
    const owners = [];
    for (let i = 0; i < st.seats; i++) if (st.deposited & (1 << i)) owners.push(st.players[i]);
    const sig = await this.send(
      [
        ...owners.map((o) => createAtaIdempotentIx(this.authority.publicKey, o, this.mint)),
        refundIx({
          programId: this.programId, caller: this.authority.publicKey, mint: this.mint, room,
          treasury: this.treasury, payer: st.payer, recipients: owners.map((o) => ata(o, this.mint)),
        }),
      ],
      "refund"
    );
    return { sig, url: explorerTx(sig), refunded: owners.map((o) => o.toBase58()), stake: st.stake };
  }

  /** Signatures touching this room PDA (deposit sigs for history, read from chain). */
  async roomSignatures(room) {
    try {
      const sigs = await this.conn.getSignaturesForAddress(pk(room), { limit: 20 }, "confirmed");
      return sigs.filter((s) => !s.err).map((s) => s.signature);
    } catch {
      return [];
    }
  }
}

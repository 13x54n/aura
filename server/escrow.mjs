/**
 * aura_escrow client (devnet).
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
export const FEE_BPS = 500; // on-chain cap
export const SLOT_HASHES_ID = new PublicKey("SysvarS1otHashes111111111111111111111111111");
/** Only these tables exist (6-decimal USDC base units), mirrored in the program. */
export const STAKES_UI = [1, 3, 5, 10];
export const STAKES_BASE = STAKES_UI.map((x) => BigInt(x) * 1_000_000n);
/** Refund reason codes (u8, recorded in the Refunded event). */
export const REASON = { none: 0, cancelled: 1, player_left: 2, deposit_timeout: 3, no_winner: 4, abandoned: 5, server_error: 6, time_limit: 7, wrong_wallet: 8 };
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

/**
 * Public RPCs rate-limit the whole IP (it blanked Lex's app balances) and mainnet is off-limits.
 * Parse SOLANA_RPC as a URL; refuse public devnet/mainnet hosts (any case / query) and the
 * CLI shorthands. Localnet (127.0.0.1 / localhost) and dedicated devnet RPCs are fine.
 */
const BLOCKED_SHORTHANDS = new Set(["d", "m", "devnet", "mainnet", "mainnet-beta", "t", "testnet"]);
const BLOCKED_HOSTS = new Set(["api.devnet.solana.com", "api.mainnet-beta.solana.com", "api.mainnet.solana.com", "api.testnet.solana.com"]);
export function rpcProblem(raw) {
  const rpc = String(raw ?? "").trim();
  if (!rpc) return "SOLANA_RPC is not set";
  if (BLOCKED_SHORTHANDS.has(rpc.toLowerCase())) return `SOLANA_RPC shorthand "${rpc}" is a public cluster`;
  let u;
  try {
    u = new URL(rpc);
  } catch {
    return "SOLANA_RPC is not a URL";
  }
  if (!/^(https?|wss?):$/.test(u.protocol)) return "SOLANA_RPC must be http(s)";
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(host)) return `SOLANA_RPC is the public endpoint ${host}`;
  if (host.includes("mainnet")) return "SOLANA_RPC points at mainnet";
  return null;
}
export function requireRpc(env = process.env) {
  const why = rpcProblem(env.SOLANA_RPC);
  if (why) {
    console.error(`\n!!!! aura escrow: ${why}. Set SOLANA_RPC to a dedicated DEVNET RPC (e.g. Helius) or localnet. Refusing. !!!!\n`);
    return null;
  }
  return String(env.SOLANA_RPC).trim();
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

export function updateConfigIx({ programId, admin, mint, treasury, settleAuthority, paused }) {
  return new TransactionInstruction({
    programId: pk(programId),
    keys: [r(admin, true), w(configPda(programId, mint)), r(treasury)],
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
      w(playerToken ?? ata(player, mint)), w(ata(room, mint)), r(TOKEN_PROGRAM_ID), r(SLOT_HASHES_ID),
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

/** Referee marks the first roll (after this a referee refund needs a reason code). */
export function startMatchIx({ programId, authority, mint, room }) {
  return new TransactionInstruction({
    programId: pk(programId),
    keys: [r(authority, true), r(configPda(programId, mint)), w(room)],
    data: disc("start_match"),
  });
}

/** `recipients` = one token account per deposited seat, in seat order. */
export function refundIx({ programId, caller, mint, room, treasury, payer, recipients, reason = 0 }) {
  return new TransactionInstruction({
    programId: pk(programId),
    keys: [
      r(caller, true), r(configPda(programId, mint)), r(mint), w(room), w(ata(room, mint)),
      w(treasury), w(payer), r(TOKEN_PROGRAM_ID), ...recipients.map((x) => w(x)),
    ],
    data: Buffer.concat([disc("refund"), u8(reason)]),
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
  const lockSlotHash = b.subarray(o, o + 32); o += 32;
  const lockedAt = Number(b.readBigInt64LE(o)); o += 8;
  const started = b[o] === 1;
  return { config, payer, roomId, stake, seats, deposited, status, bump, players, diceCommit, depositDeadline, settleDeadline, refundAfterSecs, lockSlotHash, lockedAt, started };
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
const EVENTS = ["Deposited", "RoomLocked", "MatchStarted", "Settled", "Refunded"].map((n) => [n, sha256(`event:${n}`).subarray(0, 8)]);
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
      ev.swept = b.readBigUInt64LE(o); o += 8;
      ev.resultHash = b.subarray(o, o + 32).toString("hex"); o += 32;
      ev.diceSeed = b.subarray(o, o + 32).toString("hex"); o += 32;
      ev.slotHash = b.subarray(o, o + 32).toString("hex");
    } else if (hit[0] === "Refunded") {
      let o = 8 + 16 + 32;
      const n = b.readUInt32LE(o); o += 4 + 32 * n;
      ev.recipients = n;
      ev.timeout = b[o++] === 1;
      ev.reason = b[o++];
      ev.started = b[o] === 1;
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

class ProgramError extends Error {}
function bs58sig(tx) {
  return bs58encode(tx.signature);
}
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bs58decode(str) {
  let n = 0n;
  for (const ch of String(str)) {
    const v = B58.indexOf(ch);
    if (v < 0) throw new Error("bad base58");
    n = n * 58n + BigInt(v);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const body = n === 0n ? Buffer.alloc(0) : Buffer.from(hex, "hex");
  let zeros = 0;
  for (const ch of String(str)) { if (ch === "1") zeros++; else break; }
  return Buffer.concat([Buffer.alloc(zeros), body]);
}
function bs58encode(buf) {
  let n = BigInt("0x" + (Buffer.from(buf).toString("hex") || "0"));
  let out = "";
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of buf) { if (b === 0) out = "1" + out; else break; }
  return out;
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

  /** Did `sig` land? true = confirmed ok, Error = landed with a program error, null = unknown. */
  async sigLanded(sig, waitMs = 12000) {
    const r = await this.anyLanded([sig], waitMs);
    return r === null ? null : r instanceof Error ? r : true;
  }

  /**
   * Check every attempt we sent (`{ sig, blockhash }` or a bare sig string):
   *   - the sig of any attempt that landed OK (an earlier attempt counts as success);
   *   - an Error only when attempts landed with errors AND no other attempt can still land
   *     (each unseen attempt's blockhash is no longer valid);
   *   - null = nothing decided yet (pending) when `waitMs` runs out.
   */
  async anyLanded(attempts, waitMs = 12000) {
    const list = attempts.map((a) => (typeof a === "string" ? { sig: a, blockhash: null } : a));
    if (!list.length) return null;
    const until = Date.now() + waitMs;
    for (;;) {
      let failed = null;
      const unseen = [];
      try {
        const { value } = await this.conn.getSignatureStatuses(list.map((a) => a.sig), { searchTransactionHistory: true });
        for (let i = 0; i < list.length; i++) {
          const st = value?.[i];
          if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
            if (!st.err) return list[i].sig;
            failed = new Error(`failed: ${JSON.stringify(st.err)}`);
          } else unseen.push(list[i]);
        }
        if (failed) {
          if (!unseen.length) return failed;
          // Another attempt could still land while its blockhash is valid: keep polling.
          let anyAlive = false;
          for (const a of unseen) {
            if (!a.blockhash) { anyAlive = true; break; }
            try {
              if ((await this.conn.isBlockhashValid(a.blockhash, { commitment: "confirmed" })).value) { anyAlive = true; break; }
            } catch { anyAlive = true; break; } // unsure → don't declare failure
          }
          if (!anyAlive) return failed;
        }
      } catch {}
      if (Date.now() >= until) return null;
      await new Promise((res) => setTimeout(res, 1000));
    }
  }

  /**
   * Sign + send + confirm. After an unclear failure (timeout, dropped connection) it first
   * checks whether the earlier signature landed, so a settle that paid out is never
   * re-sent or reported as failed. Program errors are never retried.
   */
  async send(ixs, label) {
    let lastErr;
    const tried = []; // every attempt we sent ({ sig, blockhash }); any of them landing = success
    for (let attempt = 0; attempt < 3; attempt++) {
      if (tried.length) {
        const landed = await this.anyLanded(tried);
        if (typeof landed === "string") return landed;
        if (landed instanceof Error) throw new Error(`${label} ${landed.message}`);
      }
      try {
        const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }), ...ixs);
        const { blockhash, lastValidBlockHeight } = await this.conn.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = this.authority.publicKey;
        tx.sign(this.authority);
        const sig = bs58sig(tx);
        tried.push({ sig, blockhash });
        await this.conn.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
        const res = await this.conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
        if (res.value.err) throw new ProgramError(`${label} failed: ${JSON.stringify(res.value.err)}`);
        return sig;
      } catch (e) {
        lastErr = e;
        if (e instanceof ProgramError || /custom program error|Simulation failed|failed: \{/.test(String(e?.message))) {
          // A program error on a retry can mean an earlier attempt already did the work.
          if (tried.length > 1) {
            const earlier = await this.anyLanded(tried.slice(0, -1), 3000);
            if (typeof earlier === "string") return earlier;
          }
          throw e;
        }
        await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
      }
    }
    const landed = await this.anyLanded(tried);
    if (typeof landed === "string") return landed;
    throw lastErr;
  }

  /** Server pays rent for Room + vault (returned when they close). */
  /** `players[i]` = wallet bound to chain seat i (only it can fund that seat). */
  async initRoom({ seats, stakeUi, players }) {
    if (!STAKES_UI.includes(Number(stakeUi)) || this.decimals !== 6) throw new Error(`stake must be ${STAKES_UI.join("/")} USDC`);
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

  /** First roll: after this, a referee refund of the locked room needs a reason code. */
  async startMatch(room) {
    return this.send([startMatchIx({ programId: this.programId, authority: this.authority.publicKey, mint: this.mint, room })], "start_match");
  }

  /** Is this the room we opened? Config (our mint's), stake and seat count must match. */
  roomProblem(st, expect = {}) {
    if (!st) return "room account missing";
    if (!st.config.equals(configPda(this.programId, this.mint))) return "room belongs to another config";
    if (expect.stake != null && st.stake !== BigInt(expect.stake)) return "stake mismatch";
    if (expect.seats != null && st.seats !== expect.seats) return "seat count mismatch";
    return null;
  }

  /**
   * Confirm-deposit: read the room account; ok only if it is the expected room
   * (config/stake/seats) and `chainSeat` is funded by the bound `wallet`.
   */
  async confirmDeposit({ room, chainSeat, wallet, stake, seats }) {
    const st = await this.fetchRoom(room);
    const problem = this.roomProblem(st, { stake, seats });
    if (problem) return { ok: false, st, problem };
    const ok = (st.deposited & (1 << chainSeat)) !== 0 && st.players[chainSeat].toBase58() === String(wallet);
    return { ok, st };
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
    return { sig, url: explorerTx(sig, this.cluster), winner: winner.toBase58(), pot, fee, payout };
  }

  /** Refund every deposit to its own depositor's ATA (created if the player closed it). */
  async refund({ room, reason = REASON.cancelled }) {
    const st = await this.fetchRoom(room);
    if (!st) return null; // already closed (settled or refunded)
    const owners = [];
    for (let i = 0; i < st.seats; i++) if (st.deposited & (1 << i)) owners.push(st.players[i]);
    const sig = await this.send(
      [
        ...owners.map((o) => createAtaIdempotentIx(this.authority.publicKey, o, this.mint)),
        refundIx({
          programId: this.programId, caller: this.authority.publicKey, mint: this.mint, room,
          treasury: this.treasury, payer: st.payer, recipients: owners.map((o) => ata(o, this.mint)), reason,
        }),
      ],
      "refund"
    );
    return { sig, url: explorerTx(sig, this.cluster), refunded: owners.map((o) => o.toBase58()), stake: st.stake };
  }

  /**
   * Unsigned deposit tx for the player's wallet to sign (player = fee payer; the server
   * never signs it). Returns base64 tx + base64 message so a later submit can be matched.
   */
  async buildDepositTx({ wallet, room, chainSeat }) {
    const { blockhash } = await this.conn.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: pk(wallet), recentBlockhash: blockhash }).add(
      depositIx({ programId: this.programId, player: wallet, mint: this.mint, room, seat: chainSeat })
    );
    return {
      tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
      message: tx.serializeMessage().toString("base64"),
    };
  }

  /** Relay a wallet-signed deposit, only if it is byte-for-byte the tx we built. */
  async submitDeposit({ signedTx, expectMessage }) {
    const tx = Transaction.from(Buffer.from(signedTx, "base64"));
    if (tx.serializeMessage().toString("base64") !== expectMessage) throw new Error("tx does not match the deposit we built");
    if (!tx.verifySignatures()) throw new Error("missing or bad wallet signature");
    const sig = await this.conn.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
    const res = await this.conn.confirmTransaction(sig, "confirmed");
    if (res.value.err) throw new Error(`deposit failed: ${JSON.stringify(res.value.err)}`);
    return { sig, url: explorerTx(sig, this.cluster) };
  }

  /**
   * Is `sig` a landed, successful tx paid by `wallet` that touched `room`? (Used before storing
   * a client-reported deposit signature.)
   */
  async verifyDepositSig(sig, { room, wallet }) {
    const tx = await this.conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!tx || tx.meta?.err) return false;
    const msg = tx.transaction.message;
    const keys = (msg.staticAccountKeys ?? msg.accountKeys).map((x) => (typeof x === "string" ? x : (x.pubkey ?? x).toBase58()));
    if (keys[0] !== String(wallet)) return false;
    const roomB58 = pk(room).toBase58();
    const program = this.programId.toBase58();
    const want = disc("deposit");
    // Our program's deposit ix (program id + discriminator), signed by the wallet, on this room.
    // Account order = depositIx: [player, config, mint, room, playerToken, vault, token, slotHashes].
    const ixs = msg.compiledInstructions
      ? msg.compiledInstructions.map((i) => ({ program: keys[i.programIdIndex], accts: i.accountKeyIndexes, data: Buffer.from(i.data) }))
      : (msg.instructions || []).map((i) => ({ program: keys[i.programIdIndex], accts: i.accounts, data: Buffer.from(bs58decode(i.data)) }));
    return ixs.some(
      (i) =>
        i.program === program &&
        i.data.length === 9 &&
        i.data.subarray(0, 8).equals(want) &&
        keys[i.accts[0]] === String(wallet) &&
        keys[i.accts[3]] === roomB58
    );
  }

  /** submitDeposit + confirm-deposit read of the room account. */
  async submitAndConfirmDeposit({ signedTx, expectMessage, room, chainSeat, wallet, stake, seats }) {
    const r = await this.submitDeposit({ signedTx, expectMessage });
    const c = await this.confirmDeposit({ room, chainSeat, wallet, stake, seats });
    return { ...r, confirmed: c.ok, locked: c.st?.status === ROOM_LOCKED };
  }

  get cluster() {
    return /127\.0\.0\.1|localhost/.test(this.rpc) ? "custom&customUrl=" + encodeURIComponent(this.rpc) : "devnet";
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
export { PublicKey as PublicKeyCtor } from "@solana/web3.js";

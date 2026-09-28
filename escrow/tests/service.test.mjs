// EscrowService unit tests with a mocked RPC connection (no network):
// send() counts any earlier landed attempt as success; confirmDeposit checks the room.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import * as E from "../../server/escrow.mjs";
import { confirmDepositRequest } from "../../server/escrowConfirm.mjs";
const require = createRequire(new URL("../../server/package.json", import.meta.url));
const { Keypair, PublicKey, TransactionInstruction } = require("@solana/web3.js");

let pass = 0, fail = 0;
const t = async (n, f) => { try { await f(); pass++; console.log("PASS", n); } catch (e) { fail++; console.log("FAIL", n, "-", e.message); } };

const mint = Keypair.generate().publicKey;
const svc = () => new E.EscrowService({ rpc: "http://127.0.0.1:1", programId: E.DEFAULT_PROGRAM_ID, mint, authority: Keypair.generate(), refundAfterSecs: 600, depositWindowSecs: 60, log: { log() {}, error() {} } });
const ix = new TransactionInstruction({ programId: new PublicKey(E.DEFAULT_PROGRAM_ID), keys: [], data: Buffer.from([0]) });

// Mock: every send "times out"; attempt `landedIdx` (in send order) shows up as confirmed.
function mockConn(s, { landedIdx, programErrorOnRetry = false }) {
  let sends = 0;
  s._sigs = [];
  s.conn = {
    getLatestBlockhash: async () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 10 }),
    sendRawTransaction: async () => {
      sends++;
      if (programErrorOnRetry && sends > 1) throw new Error("Simulation failed: custom program error: 0x1771");
    },
    confirmTransaction: async () => { throw new Error("block height exceeded"); },
    getSignatureStatuses: async (sigs) => {
      for (const x of sigs) if (!s._sigs.includes(x)) s._sigs.push(x); // `tried` is in send order
      return { value: sigs.map((x) => (s._sigs.indexOf(x) === landedIdx ? { confirmationStatus: "confirmed", err: null } : null)) };
    },
  };
  const al = s.anyLanded.bind(s);
  s.anyLanded = (sigs) => al(sigs, 0);
}

await t("send(): first attempt landed after an unclear timeout → returns that sig, no throw", async () => {
  const s = svc();
  mockConn(s, { landedIdx: 0 });
  const sig = await s.send([ix], "test");
  assert.equal(sig, s._sigs[0]);
});

await t("send(): third attempt fails but the FIRST attempt landed → success with the first sig", async () => {
  const s = svc();
  mockConn(s, { landedIdx: 0 });
  // hide attempt 0 from the in-loop checks so all attempts run, then reveal it at the end
  let calls = 0;
  const al = s.anyLanded;
  s.anyLanded = async (sigs) => (++calls < 3 ? null : al(sigs));
  const sig = await s.send([ix], "test");
  assert.equal(s._sigs.length, 3);
  assert.equal(sig, s._sigs[0]);
});

await t("send(): program error on a retry, but an earlier attempt landed → success", async () => {
  const s = svc();
  mockConn(s, { landedIdx: 0, programErrorOnRetry: true });
  let calls = 0;
  const al = s.anyLanded;
  s.anyLanded = async (sigs, w) => (++calls < 2 ? null : al(sigs, w));
  const sig = await s.send([ix], "test");
  assert.equal(sig, s._sigs[0]);
});

await t("send(): nothing landed → throws the last error", async () => {
  const s = svc();
  mockConn(s, { landedIdx: -1 });
  await assert.rejects(() => s.send([ix], "test"));
});

// confirmDeposit against decoded room fixtures
const wallet = Keypair.generate().publicKey;
const room = (over = {}) => ({
  config: E.configPda(E.DEFAULT_PROGRAM_ID, mint), stake: 1_000_000n, seats: 2, deposited: 0b01,
  players: [wallet, Keypair.generate().publicKey, PublicKey.default, PublicKey.default], ...over,
});
const withRoom = (st) => { const s = svc(); s.fetchRoom = async () => st; return s; };
const args = { room: Keypair.generate().publicKey, chainSeat: 0, wallet: wallet.toBase58(), stake: 1_000_000n, seats: 2 };

await t("confirmDeposit: funded seat in the expected room → ok", async () => {
  assert.equal((await withRoom(room()).confirmDeposit(args)).ok, true);
});
await t("confirmDeposit: stake mismatch → not ok", async () => {
  const r = await withRoom(room({ stake: 3_000_000n })).confirmDeposit(args);
  assert.equal(r.ok, false); assert.match(r.problem, /stake/);
});
await t("confirmDeposit: seat count mismatch → not ok", async () => {
  const r = await withRoom(room({ seats: 3 })).confirmDeposit(args);
  assert.equal(r.ok, false); assert.match(r.problem, /seat/);
});
await t("confirmDeposit: room from another config (other mint) → not ok", async () => {
  const r = await withRoom(room({ config: E.configPda(E.DEFAULT_PROGRAM_ID, Keypair.generate().publicKey) })).confirmDeposit(args);
  assert.equal(r.ok, false); assert.match(r.problem, /config/);
});
await t("confirmDeposit: seat not funded / funded by another wallet → not ok", async () => {
  assert.equal((await withRoom(room({ deposited: 0 })).confirmDeposit(args)).ok, false);
  assert.equal((await withRoom(room()).confirmDeposit({ ...args, wallet: Keypair.generate().publicKey.toBase58() })).ok, false);
});
await t("confirmDeposit: missing room account → not ok", async () => {
  assert.equal((await withRoom(null).confirmDeposit(args)).ok, false);
});

// ── escrow.deposit.confirm handler ──
const SIG = "5".repeat(88);
const base = (over = {}) => {
  const replies = [];
  const st = { ready: null, notReady: 0, reads: 0, verifies: 0 };
  return {
    replies, st,
    args: {
      ws: {}, room: Keypair.generate().publicKey, chainSeat: 0, wallet: wallet.toBase58(), stake: 1_000_000n, seats: 2, sig: SIG,
      escrow: {
        confirmDeposit: async () => { st.reads++; return { ok: true }; },
        verifyDepositSig: async () => { st.verifies++; return true; },
      },
      reply: (m) => replies.push(m), onReady: (s) => (st.ready = s), onNotReady: () => st.notReady++,
      attempts: 3, readTimeoutMs: 50, retryMs: 0, sleep: async () => {},
      ...over,
    },
  };
};

await t("confirm: room vault not open (e.room null) → immediate error reply, no RPC reads", async () => {
  const b = base({ room: null });
  await confirmDepositRequest(b.args);
  assert.equal(b.replies.length, 1); assert.equal(b.replies[0].ok, false); assert.equal(b.replies[0].error, "escrow_not_ready");
  assert.equal(b.st.reads, 0);
});

await t("confirm: second call on the same socket while one is in flight → confirm_in_progress", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const b = base();
  b.args.escrow.confirmDeposit = async () => { await gate; return { ok: true }; };
  b.args.readTimeoutMs = 5000;
  const first = confirmDepositRequest(b.args);
  await confirmDepositRequest(b.args);
  assert.equal(b.replies[0].error, "confirm_in_progress");
  release(); await first;
  assert.equal(b.replies[1].ok, true);
  await confirmDepositRequest(b.args); // flag cleared afterwards
  assert.equal(b.replies[2].ok, true);
});

await t("confirm: RPC reads are bounded (hanging read times out; attempts capped) → not ready", async () => {
  const b = base();
  b.args.escrow.confirmDeposit = () => { b.st.reads++; return new Promise(() => {}); };
  const t0 = Date.now();
  await confirmDepositRequest(b.args);
  assert.equal(b.st.reads, 3); assert.ok(Date.now() - t0 < 1000);
  assert.equal(b.replies[0].ok, false); assert.equal(b.st.notReady, 1); assert.equal(b.args.ws._escrowConfirming, false);
});

await t("confirm: sig stored only if verified on-chain", async () => {
  const good = base();
  await confirmDepositRequest(good.args);
  assert.equal(good.st.ready, SIG); assert.equal(good.replies[0].sig, SIG);
  const bad = base();
  bad.args.escrow.verifyDepositSig = async () => false;
  await confirmDepositRequest(bad.args);
  assert.equal(bad.replies[0].ok, true, "seat still Ready from the room read");
  assert.equal(bad.st.ready, null, "unverified sig not stored"); assert.equal(bad.replies[0].sig, null);
  const junk = base({ sig: "not-a-sig" });
  await confirmDepositRequest(junk.args);
  assert.equal(junk.st.verifies, 0); assert.equal(junk.st.ready, null);
});

// verifyDepositSig against real compiled deposit messages
const { Transaction: W3Tx } = require("@solana/web3.js");
const bs58 = (() => { const m = require("bs58"); return m.default ?? m; })();
const vfx = () => {
  const roomPk = Keypair.generate().publicKey;
  const s = svc();
  const mk = ({ programId = E.DEFAULT_PROGRAM_ID, payer = wallet, player = wallet, depRoom = roomPk, data, extra = [], err = null, legacyJson = false } = {}) => {
    const dep = E.depositIx({ programId, player, mint, room: depRoom, seat: 0 });
    if (data) dep.data = data;
    const tx = new W3Tx({ feePayer: payer, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(...extra, dep);
    const message = tx.compileMessage();
    if (legacyJson) {
      return { meta: { err }, transaction: { message: {
        accountKeys: message.accountKeys.map((k) => k.toBase58()),
        instructions: message.instructions.map((i) => ({ programIdIndex: i.programIdIndex, accounts: i.accounts, data: i.data })),
      } } };
    }
    return { meta: { err }, transaction: { message } };
  };
  const check = async (fx) => { s.conn = { getTransaction: async () => fx }; return s.verifyDepositSig(SIG, { room: roomPk, wallet: wallet.toBase58() }); };
  return { roomPk, mk, check };
};

await t("verifyDepositSig: our program's deposit ix (program id + discriminator) on this room, paid by the wallet → true", async () => {
  const v = vfx();
  assert.equal(await v.check(v.mk()), true);
  assert.equal(await v.check(v.mk({ legacyJson: true })), true, "legacy JSON message form (base58 ix data)");
});
await t("verifyDepositSig: rejects other program, wrong discriminator, other room, other payer, failed tx, missing tx", async () => {
  const v = vfx();
  assert.equal(await v.check(v.mk({ programId: Keypair.generate().publicKey })), false, "other program");
  const badData = Buffer.from(E.depositIx({ programId: E.DEFAULT_PROGRAM_ID, player: wallet, mint, room: v.roomPk, seat: 0 }).data); badData[0] ^= 1;
  assert.equal(await v.check(v.mk({ data: badData })), false, "wrong discriminator");
  // deposit into ANOTHER room, while our room only appears as a random extra account
  const decoy = new TransactionInstruction({ programId: Keypair.generate().publicKey, keys: [{ pubkey: v.roomPk, isSigner: false, isWritable: false }], data: Buffer.from([1]) });
  assert.equal(await v.check(v.mk({ depRoom: Keypair.generate().publicKey, extra: [decoy] })), false, "room only touched by another ix");
  const other = Keypair.generate().publicKey;
  assert.equal(await v.check(v.mk({ payer: other, player: other })), false, "other payer/player");
  assert.equal(await v.check(v.mk({ err: { InstructionError: [0, "x"] } })), false, "failed tx");
  assert.equal(await v.check(null), false, "missing tx");
});

// anyLanded: a failed attempt isn't final while another attempt's blockhash is still valid
const alSvc = ({ statuses, valid }) => {
  const s = svc();
  let polls = 0, vcalls = 0;
  s.conn = {
    getSignatureStatuses: async (sigs) => { const row = statuses[Math.min(polls++, statuses.length - 1)]; return { value: sigs.map((_, i) => row[i] ?? null) }; },
    isBlockhashValid: async () => ({ value: valid[Math.min(vcalls++, valid.length - 1)] }),
  };
  return s;
};
const FAILED = { confirmationStatus: "confirmed", err: { InstructionError: [0, "x"] } };
const OK = { confirmationStatus: "confirmed", err: null };
const atts = [{ sig: "A", blockhash: "bhA" }, { sig: "B", blockhash: "bhB" }];

await t("anyLanded: A failed, B still has a valid blockhash → keeps polling, then B lands → success", async () => {
  const s = alSvc({ statuses: [[FAILED, null], [FAILED, null], [FAILED, OK]], valid: [true] });
  assert.equal(await s.anyLanded(atts, 10000), "B");
});
await t("anyLanded: A failed and B's blockhash is dead (never seen) → failure", async () => {
  const s = alSvc({ statuses: [[FAILED, null]], valid: [false] });
  const r = await s.anyLanded(atts, 10000);
  assert.ok(r instanceof Error);
});
await t("anyLanded: A failed, B still valid when the wait runs out → pending (null), not failure", async () => {
  const s = alSvc({ statuses: [[FAILED, null]], valid: [true] });
  assert.equal(await s.anyLanded(atts, 0), null);
});
await t("anyLanded: all attempts failed → failure right away", async () => {
  const s = alSvc({ statuses: [[FAILED, FAILED]], valid: [true] });
  assert.ok((await s.anyLanded(atts, 10000)) instanceof Error);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

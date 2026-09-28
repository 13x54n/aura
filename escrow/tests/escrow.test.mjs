// aura_escrow program tests on LiteSVM (in-process; clock warps for the timeout cases).
// Run: cd escrow && anchor build && npm test
import { createRequire } from "module";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { LiteSVM } from "litesvm";
import * as E from "../../server/escrow.mjs";

const require = createRequire(new URL("../../server/package.json", import.meta.url));
const { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } = require("@solana/web3.js");

const PROGRAM_ID = new PublicKey(E.DEFAULT_PROGRAM_ID);
const SO = new URL("../target/deploy/aura_escrow.so", import.meta.url).pathname;
const USDC = 1_000_000n;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${m}`); };

const svm = new LiteSVM();
const admin = Keypair.generate();
const auth = Keypair.generate(); // settle authority (server)
const feeWallet = Keypair.generate();
const mintAuth = Keypair.generate();
const mintKp = Keypair.generate();
const mint = mintKp.publicKey;
for (const k of [admin, auth, feeWallet, mintAuth]) svm.airdrop(k.publicKey, 100_000_000_000n);

// Load as an upgradeable program whose upgrade authority is `admin` (init_config checks it).
{
  const elf = readFileSync(SO);
  const pd = E.programDataPda(PROGRAM_ID);
  const pdData = Buffer.alloc(45 + elf.length);
  pdData.writeUInt32LE(3, 0); pdData.writeBigUInt64LE(0n, 4); pdData[12] = 1; admin.publicKey.toBuffer().copy(pdData, 13); elf.copy(pdData, 45);
  svm.setAccount(pd, { executable: false, owner: E.UPGRADEABLE_LOADER_ID, lamports: 10_000_000_000, data: pdData });
  const progData = Buffer.alloc(36); progData.writeUInt32LE(2, 0); pd.toBuffer().copy(progData, 4);
  svm.setAccount(PROGRAM_ID, { executable: true, owner: E.UPGRADEABLE_LOADER_ID, lamports: 1_000_000_000, data: progData });
}

function send(ixs, signers) {
  svm.expireBlockhash();
  const tx = new Transaction().add(...ixs);
  tx.recentBlockhash = svm.latestBlockhash();
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const res = svm.sendTransaction(tx);
  const failed = typeof res.err === "function";
  const logs = failed ? res.meta().logs() : res.logs();
  return { ok: !failed, logs, err: failed ? String(res.err()) : null };
}
const errIs = (r, code) => !r.ok && r.logs.some((l) => l.includes(`Error Code: ${code}`));
// SlotHashes sysvar: newest entry is what the program mixes into the dice at lock.
const SLOT_HASH = Buffer.alloc(32, 0xab);
function setSlotHashes(hash = SLOT_HASH) {
  const d = Buffer.alloc(8 + 40); d.writeBigUInt64LE(1n, 0); d.writeBigUInt64LE(svm.getClock().slot, 8); hash.copy(d, 16);
  svm.setAccount(E.SLOT_HASHES_ID, { executable: false, owner: new PublicKey("Sysvar1111111111111111111111111111111111111"), lamports: 1_000_000_000, data: d });
}
const bal = (acct) => { const a = svm.getAccount(acct); return a ? Buffer.from(a.data).readBigUInt64LE(64) : null; };
const now = () => Number(svm.getClock().unixTimestamp);
function warp(secs) { const c = svm.getClock(); c.unixTimestamp = c.unixTimestamp + BigInt(secs); c.slot = c.slot + 10n; svm.setClock(c); setSlotHashes(); }
function warpTo(ts) { const c = svm.getClock(); c.unixTimestamp = BigInt(ts); c.slot = c.slot + 10n; svm.setClock(c); setSlotHashes(); }
setSlotHashes();

// Test mint (6 decimals, like USDC) + fee treasury ATA.
{
  const data = Buffer.alloc(35); data[0] = 20; data[1] = 6; mintAuth.publicKey.toBuffer().copy(data, 2); data[34] = 0;
  const r = send([
    SystemProgram.createAccount({ fromPubkey: mintAuth.publicKey, newAccountPubkey: mint, lamports: 10_000_000, space: 82, programId: E.TOKEN_PROGRAM_ID }),
    new TransactionInstruction({ programId: E.TOKEN_PROGRAM_ID, keys: [{ pubkey: mint, isSigner: false, isWritable: true }], data }),
    E.createAtaIdempotentIx(mintAuth.publicKey, feeWallet.publicKey, mint),
  ], [mintAuth, mintKp]);
  ok(r.ok, "test mint + fee ATA created " + (r.err || ""));
}
const treasury = E.ata(feeWallet.publicKey, mint);
function fund(owner, amount) {
  const data = Buffer.alloc(9); data[0] = 7; data.writeBigUInt64LE(amount, 1);
  return send([
    E.createAtaIdempotentIx(mintAuth.publicKey, owner, mint),
    new TransactionInstruction({ programId: E.TOKEN_PROGRAM_ID, data, keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: E.ata(owner, mint), isSigner: false, isWritable: true },
      { pubkey: mintAuth.publicKey, isSigner: true, isWritable: false }] }),
  ], [mintAuth]).ok;
}
const players = Array.from({ length: 5 }, () => Keypair.generate());
for (const p of players) { svm.airdrop(p.publicKey, 1_000_000_000n); fund(p.publicKey, 100n * USDC); }
const attacker = Keypair.generate(); svm.airdrop(attacker.publicKey, 1_000_000_000n); fund(attacker.publicKey, 100n * USDC);

// ── init_config ──
{
  const bad = send([E.initConfigIx({ programId: PROGRAM_ID, admin: attacker.publicKey, mint, treasury, settleAuthority: attacker.publicKey })], [attacker]);
  ok(errIs(bad, "Unauthorized"), "init_config by non-upgrade-authority rejected");
  const authTreasury = E.ata(auth.publicKey, mint);
  send([E.createAtaIdempotentIx(admin.publicKey, auth.publicKey, mint)], [admin]);
  const bad2 = send([E.initConfigIx({ programId: PROGRAM_ID, admin: admin.publicKey, mint, treasury: authTreasury, settleAuthority: auth.publicKey })], [admin]);
  ok(errIs(bad2, "BadTreasury"), "treasury owned by the settle authority rejected");
  const good = send([E.initConfigIx({ programId: PROGRAM_ID, admin: admin.publicKey, mint, treasury, settleAuthority: auth.publicKey })], [admin]);
  ok(good.ok, "init_config by upgrade authority " + (good.err || ""));
  const cfg = E.decodeConfig(svm.getAccount(E.configPda(PROGRAM_ID, mint)).data);
  ok(cfg.feeBps === 500 && cfg.treasury.equals(treasury), "config fee 5% + treasury");
}

// ── helpers ──
function newRoom({ seats = 2, stakeUi = 5, window = 300, refundAfter = 7200, bind } = {}) {
  const bound = (bind ?? players.slice(0, seats)).map((k) => (k ? k.publicKey : null));
  const roomId = Buffer.from(createHash("sha256").update(Math.random() + "").digest().subarray(0, 16));
  const seed = Buffer.from(createHash("sha256").update("seed" + Math.random()).digest());
  const room = E.roomPda(PROGRAM_ID, roomId);
  const r = send([E.initRoomIx({ programId: PROGRAM_ID, authority: auth.publicKey, mint, roomId, stake: BigInt(stakeUi) * USDC, seats,
    commit: E.diceCommit(seed), depositDeadline: now() + window, refundAfterSecs: refundAfter, players: bound })], [auth]);
  return { roomId, seed, room, vault: E.ata(room, mint), stake: BigInt(stakeUi) * USDC, ok: r.ok, r, deadline: now() + window };
}
const dep = (R, p, seat) => send([E.depositIx({ programId: PROGRAM_ID, player: p.publicKey, mint, room: R.room, seat })], [p]);
const settle = (R, seat, { signer = auth, winnerToken, seed = R.seed } = {}) => {
  const st = E.decodeRoom(svm.getAccount(R.room)?.data ?? Buffer.alloc(0));
  return send([E.settleIx({ programId: PROGRAM_ID, authority: signer.publicKey, mint, room: R.room, treasury, payer: auth.publicKey,
    winnerToken: winnerToken ?? E.ata(st ? st.players[seat] : attacker.publicKey, mint), winnerSeat: seat,
    resultHash: Buffer.alloc(32, 7), seed })], [signer]);
};
const refund = (R, caller, recipients, reason = 0) => send([E.refundIx({ programId: PROGRAM_ID, caller: caller.publicKey, mint, room: R.room, treasury, payer: auth.publicKey, recipients, reason })], [caller]);
const start = (R, signer = auth) => send([E.startMatchIx({ programId: PROGRAM_ID, authority: signer.publicKey, mint, room: R.room })], [signer]);
const roomState = (R) => E.decodeRoom(svm.getAccount(R.room).data);
const A = (k) => E.ata(k.publicKey, mint);

// ── validation ──
ok(!newRoom({ seats: 5 }).ok, "init_room seats=5 rejected");
ok(!newRoom({ refundAfter: 7201 }).ok, "init_room refund window > 2h rejected");
ok(!newRoom({ refundAfter: 30 }).ok, "init_room refund window < 60s rejected");
{
  const imp = Keypair.generate(); svm.airdrop(imp.publicKey, 1_000_000_000n);
  const roomId = Buffer.alloc(16, 9);
  const r = send([E.initRoomIx({ programId: PROGRAM_ID, authority: imp.publicKey, mint, roomId, stake: USDC, seats: 2, commit: Buffer.alloc(32), depositDeadline: now() + 300, refundAfterSecs: 600 })], [imp]);
  ok(errIs(r, "Unauthorized"), "init_room by non-settle-authority rejected");
}

// 0. Seat binding (anti-squatting): wallets are fixed by the referee at init_room.
{
  const [p1, p2] = players;
  ok(errIs(newRoom({ bind: [p1, p1] }).r, "AlreadySeated"), "init_room binding one wallet to two seats rejected");
  ok(errIs(newRoom({ seats: 2, bind: [p1, p2, attacker] }).r, "BadSeat"), "init_room binding a wallet beyond `seats` rejected");
  const R = newRoom({ bind: [p1, null] });
  ok(R.ok, "init_room with an unassigned seat");
  ok(errIs(dep(R, p2, 1), "SeatUnassigned"), "deposit into an unassigned seat rejected");
  ok(errIs(dep(R, attacker, 0), "NotYourSeat"), "stranger's deposit into a bound seat rejected");
  ok(dep(R, p1, 0).ok, "bound wallet deposits into its seat");
  ok(refund(R, auth, [A(p1)]).ok, "cleanup refund");
}

// 1. 2p win: pot 10, fee 0.5, winner 9.5; room + vault closed, rent back to payer.
{
  const [p1, p2] = players;
  const R = newRoom({ stakeUi: 5 });
  ok(R.ok, "2p room init");
  const b1 = bal(A(p1)), b2 = bal(A(p2)), bt = bal(treasury);
  ok(dep(R, p1, 0).ok, "p1 deposit seat 0");
  ok(errIs(dep(R, p1, 1), "NotYourSeat"), "same wallet into the other (bound) seat rejected");
  ok(errIs(dep(R, attacker, 1), "NotYourSeat"), "stranger's deposit into a bound seat rejected");
  ok(errIs(dep(R, p2, 0), "SeatTaken"), "taken seat rejected");
  const d2 = dep(R, p2, 1);
  ok(d2.ok && d2.logs.some((l) => l.startsWith("Program data:")), "p2 deposit -> locked");
  const st = E.decodeRoom(svm.getAccount(R.room).data);
  ok(st.status === E.ROOM_LOCKED && st.deposited === 3 && st.players[1].equals(p2.publicKey), "room Locked with both depositors on-chain");
  ok(Buffer.from(st.lockSlotHash).equals(SLOT_HASH) && st.lockedAt === now() && !st.started, "lock stored the SlotHashes entry (dice entropy) + lock time");
  ok(errIs(settle(R, 1), "NotStarted"), "settle before start_match rejected");
  ok(errIs(start(R, attacker), "Unauthorized"), "start_match by non-authority rejected");
  ok(start(R).ok && roomState(R).started, "start_match marks the first roll");
  ok(errIs(start(R), "BadStatus"), "start_match twice rejected");
  ok(errIs(settle(R, 1, { signer: attacker }), "Unauthorized"), "settle by non-authority rejected");
  ok(errIs(settle(R, 1, { winnerToken: A(attacker) }), "BadRecipient"), "settle to non-depositor rejected");
  ok(errIs(settle(R, 1, { winnerToken: treasury }), "BadRecipient"), "settle to treasury-as-winner rejected");
  ok(errIs(settle(R, 1, { seed: Buffer.alloc(32, 1) }), "BadSeed"), "settle with wrong dice seed rejected");
  const payerBefore = svm.getBalance(auth.publicKey);
  const s = settle(R, 1);
  const ev = E.parseEvents(s.logs).find((e) => e.name === "Settled");
  ok(s.ok && ev && ev.payout === 9_500_000n && ev.fee === 500_000n && ev.swept === 0n && ev.diceSeed === R.seed.toString("hex") && ev.slotHash === SLOT_HASH.toString("hex"), "Settled event: payout 9.5 / fee 0.5 / seed + slot hash revealed");
  ok(bal(A(p2)) - b2 === 4_500_000n && b1 - bal(A(p1)) === 5_000_000n && bal(treasury) - bt === 500_000n, "winner +4.5 net (9.5 paid), loser -5, fee +0.5");
  ok(!svm.getAccount(R.room) && !svm.getAccount(R.vault), "room + vault closed");
  ok(svm.getBalance(auth.publicKey) > payerBefore, "rent returned to server payer");
  ok(!settle(R, 1).ok, "double settle rejected");
  ok(!refund(R, auth, [A(p1), A(p2)]).ok, "refund after settle rejected");
}

// 2. Forfeit: seat 1 forfeits → seat 0 is paid.
{
  const [, , p3, p4] = players;
  const R = newRoom({ stakeUi: 3, bind: [p3, p4] });
  dep(R, p3, 0); dep(R, p4, 1); start(R);
  const b3 = bal(A(p3));
  ok(settle(R, 0).ok && bal(A(p3)) - b3 === 5_700_000n, "forfeit: other player paid 5.7 (pot 6 − 0.3)");
}

// 3. 4p @ 1 USDC: pot 4, fee 0.2, winner 3.8.
{
  const R = newRoom({ seats: 4, stakeUi: 1 });
  players.slice(0, 4).forEach((p, i) => dep(R, p, i));
  start(R);
  const b = bal(A(players[2]));
  const s = settle(R, 2);
  ok(s.ok && bal(A(players[2])) - b === 3_800_000n, "4p @1: winner gets 3.8");
}

// 4. Cancel (server) refunds everyone who deposited; table never filled.
{
  const [p1, p2] = players;
  const R = newRoom({ seats: 3, stakeUi: 10, bind: [p1, players[2], p2] });
  dep(R, p1, 0); dep(R, p2, 2);
  const b1 = bal(A(p1)), b2 = bal(A(p2));
  ok(errIs(refund(R, attacker, [A(p1), A(p2)]), "RefundNotAllowed"), "random signer can't refund an open room before the deadline");
  ok(errIs(refund(R, auth, [A(p1), A(p1)]), "DuplicateRecipient"), "duplicate refund recipient rejected");
  ok(errIs(refund(R, auth, [A(p1), A(attacker)]), "BadRecipient"), "foreign refund recipient rejected");
  ok(errIs(refund(R, auth, [A(p2), A(p1)]), "BadRecipient"), "refund recipients out of seat order rejected");
  ok(errIs(refund(R, auth, [A(p1)]), "BadRecipient"), "missing refund recipient rejected");
  const r = refund(R, auth, [A(p1), A(p2)]);
  ok(r.ok && bal(A(p1)) - b1 === 10n * USDC && bal(A(p2)) - b2 === 10n * USDC, "cancel: both deposits refunded");
  ok(!svm.getAccount(R.room) && !svm.getAccount(R.vault), "room + vault closed after refund");
}

// 5. Nobody / one player deposits → anyone refunds after the deposit deadline.
{
  const [p1] = players;
  const R = newRoom({ stakeUi: 1, window: 60 });
  dep(R, p1, 0);
  warp(61);
  ok(errIs(dep(R, players[1], 1), "DepositClosed"), "deposit after deadline rejected");
  const b1 = bal(A(p1));
  const r = refund(R, attacker, [A(p1)]);
  ok(r.ok && bal(A(p1)) - b1 === USDC, "one player never deposits: anyone refunds after deposit deadline");
  const R0 = newRoom({ stakeUi: 1, window: 30 });
  warp(31);
  ok(refund(R0, attacker, []).ok && !svm.getAccount(R0.room), "empty table refund/close after deadline");
}

// 6. Timeout refund after lock (short window via refund_after_secs).
{
  const [p1, p2] = players;
  const R = newRoom({ stakeUi: 5, refundAfter: 120 });
  dep(R, p1, 0); dep(R, p2, 1); start(R);
  ok(errIs(refund(R, attacker, [A(p1), A(p2)]), "RefundNotAllowed"), "locked room: random signer refund rejected before timeout");
  warp(121);
  ok(errIs(settle(R, 0), "SettleExpired"), "settle after timeout rejected");
  const b1 = bal(A(p1)), b2 = bal(A(p2));
  const r = refund(R, attacker, [A(p1), A(p2)]);
  ok(r.ok && bal(A(p1)) - b1 === 5n * USDC && bal(A(p2)) - b2 === 5n * USDC, "timeout refund by random signer after lock");
}

// 7. Donations to the vault don't block closing (swept to treasury on refund).
{
  const [p1] = players;
  const R = newRoom({ stakeUi: 1 });
  dep(R, p1, 0);
  const data = Buffer.alloc(9); data[0] = 7; data.writeBigUInt64LE(123n, 1);
  send([new TransactionInstruction({ programId: E.TOKEN_PROGRAM_ID, data, keys: [
    { pubkey: mint, isSigner: false, isWritable: true }, { pubkey: R.vault, isSigner: false, isWritable: true },
    { pubkey: mintAuth.publicKey, isSigner: true, isWritable: false }] })], [mintAuth]);
  const bt = bal(treasury);
  ok(refund(R, auth, [A(p1)]).ok && bal(treasury) - bt === 123n, "stray vault tokens swept to treasury; vault closes");
}

// 8. Pause blocks new rooms/deposits, never refunds.
{
  const [p1] = players;
  const R = newRoom({ stakeUi: 1 });
  dep(R, p1, 0);
  ok(errIs(send([E.updateConfigIx({ programId: PROGRAM_ID, admin: attacker.publicKey, mint, treasury, settleAuthority: attacker.publicKey, paused: false })], [attacker]), "Unauthorized"), "update_config by non-admin rejected");
  ok(errIs(send([E.updateConfigIx({ programId: PROGRAM_ID, admin: admin.publicKey, mint, treasury, settleAuthority: feeWallet.publicKey, paused: false })], [admin]), "BadTreasury"), "update_config rotating the settle key to the fee-account owner rejected");
  send([E.updateConfigIx({ programId: PROGRAM_ID, admin: admin.publicKey, mint, treasury, settleAuthority: auth.publicKey, paused: true })], [admin]);
  ok(errIs(dep(R, players[1], 1), "Paused"), "paused: deposit rejected");
  ok(refund(R, auth, [A(p1)]).ok, "paused: refund still works");
  send([E.updateConfigIx({ programId: PROGRAM_ID, admin: admin.publicKey, mint, treasury, settleAuthority: auth.publicKey, paused: false })], [admin]);
}

// 9. Stakes: only 1/3/5/10 USDC.
{
  ok(errIs(newRoom({ stakeUi: 2 }).r, "BadStake"), "bad stake (2 USDC) rejected");
  ok(errIs(newRoom({ stakeUi: 25 }).r, "BadStake"), "bad stake (25 USDC) rejected");
  ok([1, 3, 5, 10].every((x) => { const R = newRoom({ stakeUi: x }); return R.ok && refund(R, auth, []).ok; }), "stakes 1/3/5/10 accepted");
}

// 10. Fee cap 5% (new mint so a second config can be tried).
{
  const m2 = Keypair.generate();
  const data = Buffer.alloc(35); data[0] = 20; data[1] = 6; mintAuth.publicKey.toBuffer().copy(data, 2);
  send([
    SystemProgram.createAccount({ fromPubkey: mintAuth.publicKey, newAccountPubkey: m2.publicKey, lamports: 10_000_000, space: 82, programId: E.TOKEN_PROGRAM_ID }),
    new TransactionInstruction({ programId: E.TOKEN_PROGRAM_ID, keys: [{ pubkey: m2.publicKey, isSigner: false, isWritable: true }], data }),
    E.createAtaIdempotentIx(mintAuth.publicKey, feeWallet.publicKey, m2.publicKey),
  ], [mintAuth, m2]);
  const t2 = E.ata(feeWallet.publicKey, m2.publicKey);
  ok(errIs(send([E.initConfigIx({ programId: PROGRAM_ID, admin: admin.publicKey, mint: m2.publicKey, treasury: t2, settleAuthority: auth.publicKey, feeBps: 501 })], [admin]), "BadFee"), "fee over 5% (501 bps) rejected");
  ok(send([E.initConfigIx({ programId: PROGRAM_ID, admin: admin.publicKey, mint: m2.publicKey, treasury: t2, settleAuthority: auth.publicKey, feeBps: 500 })], [admin]).ok, "fee exactly 5% accepted");
}

// 11. Deadline-second edges (deadline inclusive for deposit/settle; refund needs > deadline).
{
  const [p1, p2] = players;
  const R = newRoom({ stakeUi: 1, window: 60, refundAfter: 60 });
  dep(R, p1, 0);
  warpTo(R.deadline);
  ok(dep(R, p2, 1).ok, "deposit at exactly deposit_deadline accepted");
  const st = roomState(R);
  ok(start(R).ok, "start_match right after lock");
  warpTo(st.settleDeadline);
  ok(errIs(refund(R, attacker, [A(p1), A(p2)]), "RefundNotAllowed"), "random refund at exactly settle_deadline rejected");
  ok(settle(R, 0).ok, "settle at exactly settle_deadline accepted");

  const R2 = newRoom({ stakeUi: 1, window: 60, refundAfter: 60 });
  dep(R2, p1, 0);
  warpTo(R2.deadline + 1);
  ok(errIs(dep(R2, p2, 1), "DepositClosed"), "deposit 1s after deposit_deadline rejected");
  ok(refund(R2, attacker, [A(p1)]).ok, "anyone refunds 1s after deposit_deadline");

  const R3 = newRoom({ stakeUi: 1, window: 60, refundAfter: 60 });
  dep(R3, p1, 0); dep(R3, p2, 1); start(R3);
  warpTo(roomState(R3).settleDeadline + 1);
  ok(errIs(settle(R3, 0), "SettleExpired"), "settle 1s after settle_deadline rejected");
  ok(refund(R3, attacker, [A(p1), A(p2)]).ok, "anyone refunds 1s after settle_deadline");
}

// 12. Referee refund of a locked room: free before the first roll, reason code after.
{
  const [p1, p2] = players;
  const R = newRoom({ stakeUi: 3 });
  dep(R, p1, 0); dep(R, p2, 1);
  const r0 = refund(R, auth, [A(p1), A(p2)]);
  const e0 = r0.ok && E.parseEvents(r0.logs).find((e) => e.name === "Refunded");
  ok(r0.ok && e0.reason === 0 && !e0.started && !e0.timeout, "referee refunds a locked room before the first roll (no reason needed)");
  const R1 = newRoom({ stakeUi: 3 });
  dep(R1, p1, 0); dep(R1, p2, 1);
  const r1 = refund(R1, auth, [A(p1), A(p2)], E.REASON.cancelled);
  ok(r1.ok && E.parseEvents(r1.logs).find((e) => e.name === "Refunded").reason === 1, "referee refund before the first roll with a reason records it");
  const R2 = newRoom({ stakeUi: 3 });
  dep(R2, p1, 0); dep(R2, p2, 1); start(R2);
  ok(errIs(refund(R2, auth, [A(p1), A(p2)]), "RefundReasonRequired"), "referee refund after the first roll without a reason rejected");
  const r2 = refund(R2, auth, [A(p1), A(p2)], E.REASON.abandoned);
  const e2 = r2.ok && E.parseEvents(r2.logs).find((e) => e.name === "Refunded");
  ok(r2.ok && e2.reason === E.REASON.abandoned && e2.started, "referee refund after the first roll with reason 'abandoned' recorded in Refunded");
}

// 13. Stray tokens at settle: payout from stake × seats, the extra swept to the treasury.
{
  const [p1, p2] = players;
  const R = newRoom({ stakeUi: 5 });
  dep(R, p1, 0); dep(R, p2, 1); start(R);
  const data = Buffer.alloc(9); data[0] = 7; data.writeBigUInt64LE(777n, 1);
  send([new TransactionInstruction({ programId: E.TOKEN_PROGRAM_ID, data, keys: [
    { pubkey: mint, isSigner: false, isWritable: true }, { pubkey: R.vault, isSigner: false, isWritable: true },
    { pubkey: mintAuth.publicKey, isSigner: true, isWritable: false }] })], [mintAuth]);
  const b1 = bal(A(p1)), bt = bal(treasury);
  const s = settle(R, 0);
  const ev = s.ok && E.parseEvents(s.logs).find((e) => e.name === "Settled");
  ok(s.ok && bal(A(p1)) - b1 === 9_500_000n && bal(treasury) - bt === 500_777n && ev.pot === 10_000_000n && ev.swept === 777n, "stray vault tokens at settle: winner gets exactly 9.5, treasury fee + 777 swept");
  ok(!svm.getAccount(R.vault), "vault closed after sweep");
}


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

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
const bal = (acct) => { const a = svm.getAccount(acct); return a ? Buffer.from(a.data).readBigUInt64LE(64) : null; };
const now = () => Number(svm.getClock().unixTimestamp);
function warp(secs) { const c = svm.getClock(); c.unixTimestamp = c.unixTimestamp + BigInt(secs); c.slot = c.slot + 10n; svm.setClock(c); }

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
function newRoom({ seats = 2, stakeUi = 5, window = 300, refundAfter = 7200 } = {}) {
  const roomId = Buffer.from(createHash("sha256").update(Math.random() + "").digest().subarray(0, 16));
  const seed = Buffer.from(createHash("sha256").update("seed" + Math.random()).digest());
  const room = E.roomPda(PROGRAM_ID, roomId);
  const r = send([E.initRoomIx({ programId: PROGRAM_ID, authority: auth.publicKey, mint, roomId, stake: BigInt(stakeUi) * USDC, seats,
    commit: E.diceCommit(seed), depositDeadline: now() + window, refundAfterSecs: refundAfter })], [auth]);
  return { roomId, seed, room, vault: E.ata(room, mint), stake: BigInt(stakeUi) * USDC, ok: r.ok, r };
}
const dep = (R, p, seat) => send([E.depositIx({ programId: PROGRAM_ID, player: p.publicKey, mint, room: R.room, seat })], [p]);
const settle = (R, seat, { signer = auth, winnerToken, seed = R.seed } = {}) => {
  const st = E.decodeRoom(svm.getAccount(R.room)?.data ?? Buffer.alloc(0));
  return send([E.settleIx({ programId: PROGRAM_ID, authority: signer.publicKey, mint, room: R.room, treasury, payer: auth.publicKey,
    winnerToken: winnerToken ?? E.ata(st ? st.players[seat] : attacker.publicKey, mint), winnerSeat: seat,
    resultHash: Buffer.alloc(32, 7), seed })], [signer]);
};
const refund = (R, caller, recipients) => send([E.refundIx({ programId: PROGRAM_ID, caller: caller.publicKey, mint, room: R.room, treasury, payer: auth.publicKey, recipients })], [caller]);
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

// 1. 2p win: pot 10, fee 0.5, winner 9.5; room + vault closed, rent back to payer.
{
  const [p1, p2] = players;
  const R = newRoom({ stakeUi: 5 });
  ok(R.ok, "2p room init");
  const b1 = bal(A(p1)), b2 = bal(A(p2)), bt = bal(treasury);
  ok(dep(R, p1, 0).ok, "p1 deposit seat 0");
  ok(errIs(dep(R, p1, 1), "AlreadySeated"), "same wallet 2nd seat rejected");
  ok(errIs(dep(R, p2, 0), "SeatTaken"), "taken seat rejected");
  const d2 = dep(R, p2, 1);
  ok(d2.ok && d2.logs.some((l) => l.startsWith("Program data:")), "p2 deposit -> locked");
  const st = E.decodeRoom(svm.getAccount(R.room).data);
  ok(st.status === E.ROOM_LOCKED && st.deposited === 3 && st.players[1].equals(p2.publicKey), "room Locked with both depositors on-chain");
  ok(errIs(settle(R, 1, { signer: attacker }), "Unauthorized"), "settle by non-authority rejected");
  ok(errIs(settle(R, 1, { winnerToken: A(attacker) }), "BadRecipient"), "settle to non-depositor rejected");
  ok(errIs(settle(R, 1, { winnerToken: treasury }), "BadRecipient"), "settle to treasury-as-winner rejected");
  ok(errIs(settle(R, 1, { seed: Buffer.alloc(32, 1) }), "BadSeed"), "settle with wrong dice seed rejected");
  const payerBefore = svm.getBalance(auth.publicKey);
  const s = settle(R, 1);
  const ev = E.parseEvents(s.logs).find((e) => e.name === "Settled");
  ok(s.ok && ev && ev.payout === 9_500_000n && ev.fee === 500_000n && ev.diceSeed === R.seed.toString("hex"), "Settled event: payout 9.5 / fee 0.5 / seed revealed");
  ok(bal(A(p2)) - b2 === 4_500_000n && b1 - bal(A(p1)) === 5_000_000n && bal(treasury) - bt === 500_000n, "winner +4.5 net (9.5 paid), loser -5, fee +0.5");
  ok(!svm.getAccount(R.room) && !svm.getAccount(R.vault), "room + vault closed");
  ok(svm.getBalance(auth.publicKey) > payerBefore, "rent returned to server payer");
  ok(!settle(R, 1).ok, "double settle rejected");
  ok(!refund(R, auth, [A(p1), A(p2)]).ok, "refund after settle rejected");
}

// 2. Forfeit: seat 1 forfeits → seat 0 is paid.
{
  const [, , p3, p4] = players;
  const R = newRoom({ stakeUi: 3 });
  dep(R, p3, 0); dep(R, p4, 1);
  const b3 = bal(A(p3));
  ok(settle(R, 0).ok && bal(A(p3)) - b3 === 5_700_000n, "forfeit: other player paid 5.7 (pot 6 − 0.3)");
}

// 3. 4p @ 1 USDC: pot 4, fee 0.2, winner 3.8.
{
  const R = newRoom({ seats: 4, stakeUi: 1 });
  players.slice(0, 4).forEach((p, i) => dep(R, p, i));
  const b = bal(A(players[2]));
  const s = settle(R, 2);
  ok(s.ok && bal(A(players[2])) - b === 3_800_000n, "4p @1: winner gets 3.8");
}

// 4. Cancel (server) refunds everyone who deposited; table never filled.
{
  const [p1, p2] = players;
  const R = newRoom({ seats: 3, stakeUi: 10 });
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
  dep(R, p1, 0); dep(R, p2, 1);
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
  ok(errIs(send([E.updateConfigIx({ programId: PROGRAM_ID, admin: attacker.publicKey, mint, settleAuthority: attacker.publicKey, paused: false })], [attacker]), "Unauthorized"), "update_config by non-admin rejected");
  send([E.updateConfigIx({ programId: PROGRAM_ID, admin: admin.publicKey, mint, settleAuthority: auth.publicKey, paused: true })], [admin]);
  ok(errIs(dep(R, players[1], 1), "Paused"), "paused: deposit rejected");
  ok(refund(R, auth, [A(p1)]).ok, "paused: refund still works");
  send([E.updateConfigIx({ programId: PROGRAM_ID, admin: admin.publicKey, mint, settleAuthority: auth.publicKey, paused: false })], [admin]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Unit tests: Phantom deeplink payload crypto, the phone-side deposit tx builder, and the
// deposit state machine with a mocked Phantom (no network).
//   cd mobile && npm test
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { encryptPayload, decryptPayload, sharedSecretFor, phantomErrorFrom, PhantomError } from "../src/escrow/phantomCrypto.ts";
import { buildDepositTx, verifySignedDeposit, isBlockhashError, DEPOSIT_DISC, COMPUTE_BUDGET_ID } from "../src/escrow/depositTx.ts";
import { runDeposit } from "../src/escrow/depositFlow.ts";

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log("PASS", name); } catch (e) { fail++; console.log("FAIL", name, "-", e.message); }
};

// Keys: our dapp box keypair, "Phantom"'s box keypair, the player's wallet.
const dapp = nacl.box.keyPair();
const phantom = nacl.box.keyPair();
const player = Keypair.generate();
const other = Keypair.generate();
const P = {
  programId: "Df1YjMHGeeXVvayPHX7Vb5svqUkV3dbdfKU9D4UZ4m2",
  mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  room: Keypair.generate().publicKey.toBase58(),
  chainSeat: 2,
  player: player.publicKey.toBase58(),
};
const bh = () => ({ blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 1000 });

// A fake Phantom: decrypts the signTransaction payload, checks the session, signs, encrypts reply.
function fakePhantom(query, { signer = player, session = "sess-1", mutate } = {}) {
  const secret = nacl.box.before(bs58.decode(query.dapp_encryption_public_key), phantom.secretKey);
  const req = decryptPayload(query.payload, query.nonce, secret);
  if (req.session !== session) return { errorCode: "4100", errorMessage: "Session is not valid" };
  const tx = Transaction.from(bs58.decode(req.transaction));
  if (mutate) mutate(tx);
  tx.partialSign(signer);
  const out = encryptPayload({ transaction: bs58.encode(tx.serialize({ requireAllSignatures: false })) }, secret);
  return { nonce: out.nonce, data: out.payload };
}

await t("payload round trip: dapp → Phantom and Phantom → dapp", () => {
  const sDapp = sharedSecretFor(bs58.encode(phantom.publicKey), dapp.secretKey);
  const sPh = nacl.box.before(dapp.publicKey, phantom.secretKey);
  assert.deepEqual(Buffer.from(sDapp), Buffer.from(sPh));
  const a = encryptPayload({ session: "abc", transaction: "xyz" }, sDapp);
  assert.deepEqual(decryptPayload(a.payload, a.nonce, sPh), { session: "abc", transaction: "xyz" });
  const b = encryptPayload({ transaction: "signed" }, sPh);
  assert.deepEqual(decryptPayload(b.payload, b.nonce, sDapp), { transaction: "signed" });
  assert.notEqual(a.nonce, encryptPayload({}, sDapp).nonce, "fresh nonce each time");
});

await t("tampered payload / wrong key / wrong nonce are rejected", () => {
  const s = sharedSecretFor(bs58.encode(phantom.publicKey), dapp.secretKey);
  const a = encryptPayload({ x: 1 }, s);
  const bytes = bs58.decode(a.payload); bytes[5] ^= 1;
  assert.throws(() => decryptPayload(bs58.encode(bytes), a.nonce, s));
  assert.throws(() => decryptPayload(a.payload, a.nonce, nacl.box.before(nacl.box.keyPair().publicKey, dapp.secretKey)));
  assert.throws(() => decryptPayload(a.payload, bs58.encode(nacl.randomBytes(24)), s));
});

await t("Phantom error codes: 4001 → Cancelled in Phantom, 4100 → session, other → phantom_error", () => {
  assert.equal(phantomErrorFrom("4001", "User rejected the request.").kind, "rejected");
  assert.equal(phantomErrorFrom("4001", "x").message, "Cancelled in Phantom");
  assert.equal(phantomErrorFrom("4100", "Unauthorized").kind, "session");
  assert.equal(phantomErrorFrom("-32603", "Internal error").kind, "phantom_error");
});

await t("tx builder: fee payer = player, sole signer, given blockhash, deposit disc + seat", () => {
  const h = bh();
  const tx = buildDepositTx({ ...P, ...h });
  assert.equal(tx.feePayer.toBase58(), P.player);
  assert.equal(tx.recentBlockhash, h.blockhash);
  assert.equal(tx.lastValidBlockHeight, 1000);
  const msg = tx.compileMessage();
  assert.equal(msg.header.numRequiredSignatures, 1);
  assert.equal(msg.accountKeys[0].toBase58(), P.player);
  // What goes to Phantom: one signature slot (the player's), empty — no server co-signature.
  const wire = Transaction.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
  assert.equal(wire.signatures.length, 1);
  assert.equal(wire.signatures[0].publicKey.toBase58(), P.player);
  assert.equal(wire.signatures[0].signature, null, "unsigned when handed to the wallet");
  assert.deepEqual(DEPOSIT_DISC, createHash("sha256").update("global:deposit").digest().subarray(0, 8));
  assert.equal(tx.instructions[0].data[8], 2);
});

await t("tx builder is byte-identical to the server/program deposit ix (server/escrow.mjs)", async () => {
  const E = await import("../../server/escrow.mjs");
  const req = createRequire(new URL("../../server/package.json", import.meta.url));
  const W = req("@solana/web3.js");
  const h = bh();
  const serverTx = new W.Transaction({ feePayer: new W.PublicKey(P.player), recentBlockhash: h.blockhash }).add(
    E.depositIx({ programId: P.programId, player: P.player, mint: P.mint, room: P.room, seat: P.chainSeat })
  );
  const appTx = buildDepositTx({ ...P, ...h });
  assert.equal(Buffer.from(appTx.serializeMessage()).toString("hex"), Buffer.from(serverTx.serializeMessage()).toString("hex"));
});

await t("each prompt gets a fresh blockhash (different message each build)", () => {
  const a = buildDepositTx({ ...P, ...bh() }), b = buildDepositTx({ ...P, ...bh() });
  assert.notEqual(a.recentBlockhash, b.recentBlockhash);
});

await t("verifySignedDeposit: accepts player-signed; rejects unsigned, other fee payer, extra signer, altered ix", () => {
  const h = bh();
  const ok = buildDepositTx({ ...P, ...h }); ok.partialSign(player);
  assert.equal(verifySignedDeposit(ok, P), null);
  assert.match(verifySignedDeposit(buildDepositTx({ ...P, ...h }), P), /signature missing/);
  const wrongPayer = buildDepositTx({ ...P, ...h }); wrongPayer.feePayer = other.publicKey; wrongPayer.partialSign(other, player);
  assert.ok(verifySignedDeposit(wrongPayer, P));
  const extra = buildDepositTx({ ...P, ...h });
  extra.add(new TransactionInstruction({ programId: COMPUTE_BUDGET_ID, keys: [{ pubkey: other.publicKey, isSigner: true, isWritable: false }], data: Buffer.from([2, 0, 0, 0, 0]) }));
  extra.partialSign(player, other);
  assert.match(verifySignedDeposit(extra, P), /extra signer/);
  const altered = buildDepositTx({ ...P, chainSeat: 0, ...h }); altered.partialSign(player);
  assert.match(verifySignedDeposit(altered, P), /changed/);
  const cb = buildDepositTx({ ...P, ...h });
  cb.instructions.unshift(new TransactionInstruction({ programId: COMPUTE_BUDGET_ID, keys: [], data: Buffer.from([2, 0x40, 0x0d, 0x03, 0]) }));
  cb.partialSign(player);
  assert.equal(verifySignedDeposit(cb, P), null, "wallet-added compute budget allowed");
});

await t("isBlockhashError", () => {
  assert.ok(isBlockhashError(new Error("Transaction simulation failed: Blockhash not found")));
  assert.ok(isBlockhashError({ name: "TransactionExpiredBlockheightExceededError", message: "Signature x has expired: block height exceeded." }));
  assert.ok(!isBlockhashError(new Error("custom program error: 0x1")));
});

// ── Deposit flow with a mocked Phantom deeplink ──
function harness(opts = {}) {
  const steps = [];
  const log = { prompts: 0, blockhashes: [], sent: 0, reconnects: 0, confirmed: 0 };
  let session = opts.session ?? "sess-1";
  let sendFails = opts.sendFails ?? 0;
  const deps = {
    hasSession: async () => !!session && !opts.noSession,
    reconnect: async () => { log.reconnects++; session = "sess-2"; opts.noSession = false; return opts.reconnectWallet ?? P.player; },
    getBlockhash: async () => { const h = bh(); log.blockhashes.push(h.blockhash); return h; },
    sign: async (tx) => {
      log.prompts++;
      // what phantomSignTransaction does: encrypt {session, transaction} → deeplink → decrypt reply
      const sDapp = sharedSecretFor(bs58.encode(phantom.publicKey), dapp.secretKey);
      const { nonce, payload } = encryptPayload({ session, transaction: bs58.encode(tx.serialize({ requireAllSignatures: false })) }, sDapp);
      if (opts.reject?.(log.prompts)) throw phantomErrorFrom("4001", "User rejected the request.");
      const reply = fakePhantom({ dapp_encryption_public_key: bs58.encode(dapp.publicKey), nonce, payload }, { session: opts.phantomSession ?? session, signer: opts.signer });
      if (reply.errorCode) { opts.phantomSession = undefined; throw phantomErrorFrom(reply.errorCode, reply.errorMessage); }
      return Transaction.from(bs58.decode(decryptPayload(reply.data, reply.nonce, sDapp).transaction));
    },
    sendAndConfirm: async (raw, h) => {
      log.sent++;
      const tx = Transaction.from(raw);
      assert.equal(tx.recentBlockhash, h.blockhash, "sent tx uses the blockhash fetched for that prompt");
      if (sendFails-- > 0) throw new Error("Transaction simulation failed: Blockhash not found");
      return bs58.encode(tx.signature);
    },
    confirmOnServer: async () => { log.confirmed++; return { ok: opts.serverOk ?? true, url: "http://x" }; },
    onStep: (s) => steps.push(s.step + (s.retry ? ":retry" : "")),
  };
  return { deps, steps, log };
}

await t("flow: happy path → wallet → sending → confirming (server chain read) → locked", async () => {
  const h = harness();
  const r = await runDeposit(P, h.deps);
  assert.equal(r.step, "locked");
  assert.deepEqual(h.steps, ["preparing", "wallet", "sending", "confirming", "locked"]);
  assert.equal(h.log.prompts, 1); assert.equal(h.log.confirmed, 1);
});

await t("flow: expired blockhash → fresh blockhash + one automatic re-prompt ('Took a bit long')", async () => {
  const h = harness({ sendFails: 1 });
  const r = await runDeposit(P, h.deps);
  assert.equal(r.step, "locked");
  assert.equal(h.log.prompts, 2);
  assert.equal(new Set(h.log.blockhashes).size, 2, "second prompt used a new blockhash");
  assert.ok(h.steps.includes("wallet:retry"));
  assert.ok(!h.steps.includes("error"));
});

await t("flow: blockhash expires twice → soft error after exactly one re-prompt", async () => {
  const h = harness({ sendFails: 5 });
  const r = await runDeposit(P, h.deps);
  assert.equal(r.step, "error"); assert.equal(h.log.prompts, 2);
});

await t("flow: rejected in Phantom → cancelled (nothing sent), then retry succeeds", async () => {
  const h = harness({ reject: (n) => n === 1 });
  const r = await runDeposit(P, h.deps);
  assert.equal(r.step, "cancelled"); assert.equal(h.log.sent, 0);
  const r2 = await runDeposit(P, h.deps);
  assert.equal(r2.step, "locked");
});

await t("flow: no Phantom session → reconnect first, then sign", async () => {
  const h = harness({ noSession: true });
  const r = await runDeposit(P, h.deps);
  assert.equal(r.step, "locked"); assert.equal(h.log.reconnects, 1);
  assert.equal(h.steps[0], "connecting");
});

await t("flow: session expired at Phantom (4100) → reconnect, re-prompt once", async () => {
  const h = harness({ phantomSession: "stale" });
  const r = await runDeposit(P, h.deps);
  assert.equal(r.step, "locked"); assert.equal(h.log.reconnects, 1); assert.equal(h.log.prompts, 2);
});

await t("flow: reconnect returns a different wallet → error, nothing signed", async () => {
  const h = harness({ noSession: true, reconnectWallet: other.publicKey.toBase58() });
  const r = await runDeposit(P, h.deps);
  assert.equal(r.step, "error"); assert.equal(h.log.prompts, 0);
});

await t("flow: wallet signs with a different key → rejected before sending", async () => {
  const h = harness({ signer: other });
  const r = await runDeposit(P, h.deps);
  assert.equal(r.step, "error"); assert.equal(h.log.sent, 0);
});

await t("flow: server's room-account read doesn't show the seat → not locked", async () => {
  const h = harness({ serverOk: false });
  const r = await runDeposit(P, h.deps);
  assert.equal(r.step, "error");
});

await t("flow: signed tx returned after an Expo Go reload is submitted without re-prompting", async () => {
  const h = harness();
  const orphan = buildDepositTx({ ...P, ...bh() }); orphan.partialSign(player);
  const r = await runDeposit(P, { ...h.deps, takeOrphan: () => orphan });
  assert.equal(r.step, "locked"); assert.equal(h.log.prompts, 0);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

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
import { runDeposit, awaitLandingOrExpiry, singleFlight } from "../src/escrow/depositFlow.ts";
import { createReturnWatcher } from "../src/escrow/appReturn.ts";
import { clientRpcProblem, vetClientRpc, trackClientRpc, DEVNET_GENESIS } from "../src/escrow/rpcGuard.ts";
import { depositView, COPY } from "../src/escrow/depositCopy.ts";

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

await t("Phantom error codes: 4001 → Not approved, 4100 → session, other → phantom_error", () => {
  assert.equal(phantomErrorFrom("4001", "User rejected the request.").kind, "rejected");
  assert.equal(phantomErrorFrom("4001", "x").message, "Not approved");
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

await t("flow: expired blockhash → fresh blockhash + one automatic re-prompt ('That took too long, please approve once more')", async () => {
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

// ── (1) Orphan after an Expo Go reload: poll status + blockhash validity, never lastValidBlockHeight ──
function orphanDeps(h, { statuses, valid }) {
  const calls = { status: 0, valid: 0, sendRaw: 0 };
  return {
    calls,
    deps: {
      ...h.deps,
      sendRaw: async () => { calls.sendRaw++; throw new Error("already processed"); }, // errors ignored
      sigStatus: async () => statuses[Math.min(calls.status++, statuses.length - 1)],
      blockhashValid: async () => valid[Math.min(calls.valid++, valid.length - 1)],
      sleep: async () => {},
    },
  };
}
const signedOrphan = () => { const o = buildDepositTx({ ...P, ...bh() }); o.partialSign(player); return o; };

await t("orphan: lands a few polls later → confirm, no second Phantom prompt (no double deposit)", async () => {
  const h = harness();
  const o = orphanDeps(h, { statuses: [null, null, null, "confirmed"], valid: [true] });
  const orphan = signedOrphan();
  const r = await runDeposit(P, { ...o.deps, takeOrphan: () => orphan });
  assert.equal(r.step, "locked"); assert.equal(h.log.prompts, 0); assert.equal(h.log.sent, 0, "sendAndConfirm (lastValidBlockHeight path) not used");
  assert.equal(r.sig, bs58.encode(orphan.signature));
  assert.equal(o.calls.sendRaw, 1);
});

await t("orphan: blockhash still valid, sig not found yet → keeps polling, does NOT re-prompt", async () => {
  const h = harness();
  const o = orphanDeps(h, { statuses: [null], valid: [true] });
  const r = await runDeposit(P, { ...o.deps, takeOrphan: () => signedOrphan() });
  assert.equal(h.log.prompts, 0, "no re-prompt while the first deposit can still land");
  assert.equal(r.step, "error"); // gave up waiting after maxPolls → "try again in a minute"
  assert.ok(o.calls.status >= 100);
});

await t("orphan: re-prompt only once the blockhash is invalid AND the sig was never found", async () => {
  const h = harness();
  const o = orphanDeps(h, { statuses: [null], valid: [true, true, false] });
  const r = await runDeposit(P, { ...o.deps, takeOrphan: () => signedOrphan() });
  assert.equal(r.step, "locked"); assert.equal(h.log.prompts, 1);
  assert.equal(o.calls.valid, 3);
});

await t("orphan: lands in the last slot (status found after blockhash went invalid) → no re-prompt", async () => {
  const h = harness();
  const o = orphanDeps(h, { statuses: [null, "confirmed"], valid: [false] });
  const r = await runDeposit(P, { ...o.deps, takeOrphan: () => signedOrphan() });
  assert.equal(r.step, "locked"); assert.equal(h.log.prompts, 0);
});

await t("awaitLandingOrExpiry: failed on-chain → 'failed'; unsure validity (RPC error) keeps waiting", async () => {
  assert.equal(await awaitLandingOrExpiry("s", "b", { sigStatus: async () => "failed", blockhashValid: async () => true, sleep: async () => {} }), "failed");
  let n = 0;
  const r = await awaitLandingOrExpiry("s", "b", { sigStatus: async () => (++n > 4 ? "confirmed" : null), blockhashValid: async () => { throw new Error("rpc down"); }, sleep: async () => {} });
  assert.equal(r, "landed");
});

// ── (2) Return watcher: only after a real background ──
function fakeTimers() {
  const q = [];
  return { q, set: (fn, ms) => { const t = { fn, ms, dead: false }; q.push(t); return t; }, clear: (t) => { if (t) t.dead = true; }, fire: () => q.filter((t) => !t.dead).forEach((t) => { t.dead = true; t.fn(); }) };
}
await t("return watcher: inactive → active (shade, dialogs) never fires", () => {
  const tm = fakeTimers(); let fired = 0;
  const w = createReturnWatcher(() => fired++, 2500, tm);
  w.onChange("inactive"); w.onChange("active"); w.onChange("inactive"); w.onChange("active");
  tm.fire(); assert.equal(fired, 0);
});
await t("return watcher: active → background → active fires once after the grace", () => {
  const tm = fakeTimers(); let fired = 0;
  const w = createReturnWatcher(() => fired++, 2500, tm);
  w.onChange("inactive"); w.onChange("background"); w.onChange("active");
  assert.equal(tm.q.filter((t) => !t.dead)[0].ms, 2500);
  tm.fire(); assert.equal(fired, 1);
  w.onChange("inactive"); w.onChange("active"); tm.fire(); assert.equal(fired, 1, "not re-armed without another background");
});
await t("return watcher: redirect arrives (stop) or app leaves again during the grace → no fire", () => {
  const tm = fakeTimers(); let fired = 0;
  const w = createReturnWatcher(() => fired++, 2500, tm);
  w.onChange("background"); w.onChange("active"); w.stop(); tm.fire();
  w.onChange("background"); w.onChange("active"); w.onChange("background"); tm.fire();
  assert.equal(fired, 0);
});

// ── (3) clientRpc guard ──
await t("clientRpc guard: exact allowlist + local/LAN accepted (dev builds)", () => {
  for (const ok of [
    "https://api.devnet.solana.com", "https://API.DEVNET.SOLANA.COM/",
    "https://devnet.helius-rpc.com/?api-key=x", "https://eu.devnet.helius-rpc.com/?api-key=x",
    "https://my-node.solana-devnet.quiknode.pro/abc123/",
    "http://127.0.0.1:8899", "http://localhost:8899", "http://[::1]:8899",
    "http://192.168.1.20:8899", "http://10.0.0.5:8899", "http://172.16.0.1:8899", "http://172.31.255.254:8899",
  ]) assert.equal(clientRpcProblem(ok, { allowLocal: true }), null, ok);
});

await t("clientRpc guard: release builds (allowLocal false) reject local/LAN hosts; remote allowlist still passes", async () => {
  for (const lan of ["http://192.168.1.20:8899", "http://127.0.0.1:8899", "http://localhost:8899", "http://10.0.0.5:8899", "http://[::1]:8899"]) {
    assert.match(clientRpcProblem(lan) ?? "", /only in development builds/, lan);
    assert.match(clientRpcProblem(lan, { allowLocal: false }) ?? "", /only in development builds/, lan);
    let asked = 0;
    const v = await vetClientRpc(lan, async () => { asked++; return "localnet-genesis"; }, { allowLocal: false });
    assert.equal(v.url, null, lan); assert.equal(asked, 0);
  }
  for (const ok of ["https://api.devnet.solana.com", "https://devnet.helius-rpc.com/?api-key=x", "https://my-node.solana-devnet.quiknode.pro/abc123/"]) {
    assert.equal(clientRpcProblem(ok), null, ok);
    assert.equal((await vetClientRpc(ok, async () => DEVNET_GENESIS, { allowLocal: false })).url, ok);
  }
});

await t("clientRpc guard: substring/lookalike hosts, mainnet and others rejected", () => {
  for (const bad of [
    "https://devnet.attacker.example", "https://evil-devnet.helius-rpc.com.attacker", "https://devnet.helius-rpc.com.attacker/",
    "https://evildevnet.helius-rpc.com", "https://xdevnet.helius-rpc.com", "https://solana-devnet.quiknode.pro", "https://x.solana-devnet.quiknode.pro.evil.com",
    "https://api.devnet.solana.com.evil.io", "https://api-devnet.solana.com", "https://my-devnet-rpc.example.com",
    "https://api.mainnet-beta.solana.com", "https://mainnet.helius-rpc.com/?api-key=x", "https://devnet.helius-rpc.com/?cluster=mainnet",
    "https://user:pw@api.devnet.solana.com", "ws://127.0.0.1:8900", "ftp://api.devnet.solana.com", "devnet", "", null,
    "http://8.8.8.8:8899", "http://172.32.0.1:8899", "http://192.169.0.1:8899", "http://macbook.local:8899", "http://999.1.1.1:8899",
  ]) assert.ok(clientRpcProblem(bad), String(bad));
});

await t("vetClientRpc: remote host must report the devnet genesis; mismatch / RPC error → fallback", async () => {
  let asked = 0;
  const g = (hash) => async () => { asked++; return hash; };
  assert.equal((await vetClientRpc("https://api.devnet.solana.com", g(DEVNET_GENESIS))).url, "https://api.devnet.solana.com");
  const mm = await vetClientRpc("https://devnet.helius-rpc.com/?api-key=x", g("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"));
  assert.equal(mm.url, null); assert.match(mm.reason, /not devnet/);
  const err = await vetClientRpc("https://api.devnet.solana.com", async () => { throw new Error("timeout"); });
  assert.equal(err.url, null);
  asked = 0;
  assert.equal((await vetClientRpc("https://devnet.attacker.example", g(DEVNET_GENESIS))).url, null);
  assert.equal(asked, 0, "not on the allowlist → never even asked");
});

await t("vetClientRpc: local/LAN hosts skip the genesis check (localnet has its own genesis)", async () => {
  let asked = 0;
  const r = await vetClientRpc("http://192.168.1.20:8899", async () => { asked++; return "localnet-genesis"; }, { allowLocal: true });
  assert.equal(r.url, "http://192.168.1.20:8899"); assert.equal(asked, 0);
});

await t("vetClientRpc: genesis check that hangs past the timeout → timedOut (sheet shows 'Network is slow')", async () => {
  const t0 = Date.now();
  const v = await vetClientRpc("https://api.devnet.solana.com", () => new Promise((res) => setTimeout(() => res(DEVNET_GENESIS), 2000)), { timeoutMs: 50 });
  assert.equal(v.url, null); assert.equal(v.timedOut, true); assert.match(v.reason, /timed out after 50/);
  assert.ok(Date.now() - t0 < 1000, "did not wait for the slow RPC");
  // A plain RPC error / wrong genesis is not a timeout → caller falls back to the normal RPC.
  assert.ok(!(await vetClientRpc("https://api.devnet.solana.com", async () => { throw new Error("boom"); })).timedOut);
  assert.ok(!(await vetClientRpc("https://api.devnet.solana.com", async () => "wrong", { timeoutMs: 50 })).timedOut);
});

await t("trackClientRpc: picks up a server.info that arrives after mount", () => {
  const listeners = {};
  const src = { escrowInfo: { clientRpc: null }, on: (ev, cb) => { (listeners[ev] ??= []).push(cb); return () => (listeners[ev] = listeners[ev].filter((x) => x !== cb)); } };
  const seen = [];
  const off = trackClientRpc(src, (v) => seen.push(v));
  assert.deepEqual(seen, [null]);
  listeners["server.info"].forEach((cb) => cb({ type: "server.info", escrow: { live: true, clientRpc: "http://192.168.1.20:8899" } }));
  assert.equal(seen.at(-1), "http://192.168.1.20:8899");
  off();
  assert.equal(listeners["server.info"].length, 0, "unsubscribes on unmount");
});

// ── Sheet copy (design) ──
await t("copy: before switching apps → 'Opening Phantom to approve {stake} USDC…' with spinner", () => {
  for (const step of [{ step: "preparing" }, { step: "wallet", retry: false }]) {
    const v = depositView(step, 5, false);
    assert.equal(v.status, "Opening Phantom to approve 5 USDC…"); assert.ok(v.spinner); assert.equal(v.primary.disabled, true);
  }
});
await t("copy: first step → 'Preparing transaction…' with spinner, button disabled", () => {
  const v = depositView({ step: "starting" }, 5, false);
  assert.equal(v.status, "Preparing transaction…"); assert.ok(v.spinner);
  assert.ok(v.primary); assert.equal(v.primary.disabled, true); assert.ok(!v.leave);
});
await t("copy: RPC timeout → 'Network is slow' + Try again (enabled), no spinner", () => {
  const v = depositView({ step: "slow" }, 5, false);
  assert.equal(v.status, "Network is slow"); assert.ok(!v.spinner);
  assert.equal(v.primary.label, "Try again"); assert.equal(v.primary.disabled, false);
});
await t("double-tap guard: two taps while preparing run the deposit once; a later tap runs again", async () => {
  let runs = 0; let release;
  const start = singleFlight(async () => { runs++; await new Promise((r) => (release = r)); return "done"; });
  const a = start(); const b = start();
  assert.equal(start.busy(), true);
  assert.equal(await b, null, "second tap ignored");
  release(); assert.equal(await a, "done"); assert.equal(runs, 1);
  assert.equal(start.busy(), false);
  const c = start(); release(); await c; assert.equal(runs, 2, "Try again works after the first run ends");
  // A throwing run also releases the gate.
  const bad = singleFlight(async () => { throw new Error("x"); });
  await bad().catch(() => {}); assert.equal(bad.busy(), false);
});
await t("double-tap guard: button is never enabled while a step is in flight", () => {
  for (const st of [{ step: "starting" }, { step: "connecting" }, { step: "preparing" }, { step: "wallet", retry: false }, { step: "wallet", retry: true }, { step: "sending" }, { step: "confirming", sig: "x" }, { step: "locked", sig: "x", url: null }]) {
    const v = depositView(st, 1, false);
    assert.ok(v.spinner && v.primary?.disabled === true, st.step);
  }
});
await t("copy: blockhash re-prompt → 'That took too long, please approve once more'", () => {
  assert.equal(depositView({ step: "wallet", retry: true }, 1, false).status, "That took too long, please approve once more");
  assert.equal(COPY.reprompt, "That took too long, please approve once more");
});
await t("copy: on return → 'Confirming on Solana…' until the server's room read; then Locked ✓", () => {
  for (const step of [{ step: "sending" }, { step: "confirming", sig: "x" }, { step: "locked", sig: "x", url: null }]) {
    assert.equal(depositView(step, 1, false).status, "Confirming on Solana…");
  }
  const v = depositView({ step: "locked", sig: "x", url: null }, 1, true);
  assert.equal(v.status, "Locked ✓"); assert.ok(!v.spinner);
});
await t("copy: cancelled / returned without approving / error → 'Not approved' + Try again + Leave table, no spinner", () => {
  for (const step of [{ step: "cancelled" }, { step: "error", message: "boom" }]) {
    const v = depositView(step, 1, false);
    assert.equal(v.status, "Not approved"); assert.ok(!v.spinner);
    assert.equal(v.primary.label, "Try again"); assert.ok(v.leave);
  }
});
await t("copy: no state ever shows a spinner without an in-flight step", () => {
  const all = [null, { step: "starting" }, { step: "slow" }, { step: "connecting" }, { step: "preparing" }, { step: "wallet", retry: false }, { step: "sending" }, { step: "confirming", sig: "x" }, { step: "locked", sig: "x", url: null }, { step: "cancelled" }, { step: "error", message: "m" }];
  for (const st of all) {
    const v = depositView(st, 1, false);
    assert.ok(v.spinner || v.primary || v.status === "Locked ✓", `stuck state ${st?.step}`);
    assert.ok(!(v.spinner && v.primary && !v.primary.disabled), "spinner and a tappable button at once");
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

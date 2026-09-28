// Gate-3 end-to-end on a LOCAL validator: scripted players (test-p1/p2 keypairs from
// ~/.config/aura) drive a private match server over WebSocket and sign their own deposits.
// Cases: win + payout, forfeit, cancel (player leaves) refund, never-deposits (timeout) refund.
//   escrow/scripts/localnet-up.sh      # validator + program + test mint (prints ESCROW_MINT)
//   ESCROW_MINT=<mint> node escrow/tests/e2e-localnet.mjs
import { createRequire } from "module";
import { spawn } from "child_process";
import { homedir } from "os";
import * as E from "../../server/escrow.mjs";
const require = createRequire(new URL("../../server/package.json", import.meta.url));
const { Connection, PublicKey, Transaction } = require("@solana/web3.js");
const WS = require("ws");

const RPC = process.env.SOLANA_RPC || "http://127.0.0.1:8899";
if (!/127\.0\.0\.1|localhost/.test(RPC)) throw new Error("e2e-localnet only runs against a local validator");
const MINT = process.env.ESCROW_MINT;
if (!MINT) throw new Error("set ESCROW_MINT (printed by localnet-up.sh)");
const PORT = Number(process.env.E2E_PORT || 3099);
const K = homedir() + "/.config/aura/";
const conn = new Connection(RPC, "confirmed");
const p1 = E.loadKeypair(K + "test-p1.json"), p2 = E.loadKeypair(K + "test-p2.json");
const feeWallet = E.loadKeypair(K + "fee-wallet.json").publicKey;
const treasury = feeWallet; // bal() resolves its USDC ATA
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
const bal = async (owner) => BigInt((await conn.getTokenAccountBalance(E.ata(owner, MINT))).value.amount);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let serverLog = "";
const servers = [];
function startServer(port, extra = {}) {
  const srv = spawn("node", ["match-server.mjs"], {
    cwd: new URL("../../server/", import.meta.url).pathname,
    env: {
      ...process.env, PORT: String(port), HISTORY_FILE: `/tmp/aura-hist-e2e-${port}.json`, FORFEITS_FILE: `/tmp/aura-forfeits-e2e-${port}.json`,
      TURN_MS: "400", GRACE_MS: "800", ESCROW_LIVE: "1", SOLANA_RPC: RPC, ESCROW_MINT: MINT,
      ESCROW_AUTHORITY_KEYPAIR: K + "escrow-authority.json", ESCROW_DEPOSIT_SECS: "30", ESCROW_REFUND_AFTER_SECS: "300",
      ESCROW_POLL_MS: "700", ...extra,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  srv.stdout.on("data", (d) => (serverLog += d));
  srv.stderr.on("data", (d) => (serverLog += d));
  servers.push(srv);
  return srv;
}
let port = PORT;
startServer(PORT);
const cleanup = () => { for (const s of servers) try { s.kill(); } catch {} };
process.on("exit", cleanup);

function client(name, kp) {
  const ws = new WS(`ws://127.0.0.1:${port}`);
  const log = [];
  const waiters = [];
  const c = {
    ws, log, name, kp, seat: null, state: null, auto: false,
    send: (m) => ws.send(JSON.stringify({ playerId: "e2e-" + name, playerName: name, wallet: kp.publicKey.toBase58(), ...m })),
    wait: (pred, ms = 60000) => new Promise((res, rej) => {
      const hit = log.find(pred);
      if (hit) return res(hit);
      const t = setTimeout(() => rej(new Error(`${name}: timeout waiting`)), ms);
      waiters.push({ pred, res: (m) => { clearTimeout(t); res(m); } });
    }),
    ready: new Promise((r) => ws.on("open", r)),
  };
  ws.on("message", async (raw) => {
    const m = JSON.parse(raw);
    log.push(m);
    if (m.seat != null && (m.type === "room.created" || m.type === "room.joined")) c.seat = m.seat;
    if (m.state) c.state = m.state;
    if (m.type === "match.started") c.seat = m.yourSeat;
    for (const w of waiters.splice(0)) (w.pred(m) ? w.res(m) : waiters.push(w));
    // Deposit: sign exactly the server-built tx with the player's own key.
    if (m.type === "escrow.deposit.tx") {
      const tx = Transaction.from(Buffer.from(m.tx, "base64"));
      tx.partialSign(kp);
      c.send({ type: "escrow.deposit.submit", tx: tx.serialize().toString("base64") });
    }
    // Bot: roll on our turn, move the most advanced legal piece.
    if (c.auto) {
      if ((m.type === "match.started" || m.type === "turn.changed") && m.currentSeat === c.seat) c.send({ type: "game.roll" });
      if (m.type === "die.rolled" && m.seat === c.seat && m.legalMoves?.length) {
        const best = m.legalMoves.slice().sort((a, b) => b.from - a.from)[0];
        c.send({ type: "game.move", pieceIndex: best.idx });
      }
    }
  });
  return c;
}
const refundedFor = (c) => c.wait((m) => m.type === "escrow.refunded", 90000);

async function seatBoth(code, { deposit1 = true, deposit2 = true, stake = 1 } = {}) {
  const A = client("A", p1), B = client("B", p2);
  await Promise.all([A.ready, B.ready]);
  A.send({ type: "room.create", roomCode: code, mode: "2p", stake });
  await A.wait((m) => m.type === "room.created");
  B.send({ type: "room.join", roomCode: code });
  await B.wait((m) => m.type === "room.joined");
  const open = await A.wait((m) => m.type === "room.state" && m.state?.escrow?.phase === "depositing", 30000);
  if (deposit1) A.send({ type: "escrow.deposit.build" });
  if (deposit2) B.send({ type: "escrow.deposit.build" });
  return { A, B, esc: open.state.escrow };
}

const waitServer = async (p) => { for (let i = 0; i < 40; i++) { try { return await (await fetch(`http://127.0.0.1:${p}/`)).json(); } catch { await sleep(250); } } };
await waitServer(PORT);
const health = await (await fetch(`http://127.0.0.1:${PORT}/`)).json();
ok(health.escrowLive === true, "server reports escrow live on localnet");

// ── 1. Win + payout ──
{
  const b1 = await bal(p1.publicKey), b2 = await bal(p2.publicKey), bt = await bal(treasury);
  const { A, B, esc } = await seatBoth("E2EWIN");
  ok(!!esc.room && !!esc.initSig && esc.stake === 1 && esc.payout === 1.9, `win: vault opened (${esc.initSig?.slice(0, 10)}…) pot 2 / payout 1.9`);
  const signing = await A.wait((m) => m.type === "room.state" && Object.values(m.state?.escrow?.seats || {}).some((s) => s.state === "signing" || s.state === "depositing"), 20000).catch(() => null);
  ok(!!signing, "win: lobby shows a seat signing/depositing");
  const sent = await A.wait((m) => m.type === "escrow.deposit.sent", 30000);
  ok(!!sent.sig && sent.confirmed === true, "win: A deposit relayed + confirm-deposit read the room account");
  A.auto = B.auto = true;
  const started = await A.wait((m) => m.type === "match.started", 30000);
  const readyState = A.log.filter((m) => m.type === "room.state").map((m) => m.state?.escrow).filter(Boolean).pop();
  ok(started && Object.values(readyState.seats).every((s) => s.state === "ready"), "win: both seats Ready from chain before start");
  if (started.currentSeat === A.seat) A.send({ type: "game.roll" }); else B.send({ type: "game.roll" });
  const done = await A.wait((m) => m.type === "match.completed", 240000);
  const winnerIsA = done.winner === A.seat;
  ok(done.payout?.sig && done.payout.amount === 1.9 && done.payout.fee === 0.1, `win: match.completed payout 1.9 fee 0.1 sig ${done.payout?.sig?.slice(0, 12)}…`);
  const a1 = await bal(p1.publicKey), a2 = await bal(p2.publicKey), at = await bal(treasury);
  const [w0, w1, l0, l1] = winnerIsA ? [b1, a1, b2, a2] : [b2, a2, b1, a1];
  ok(w1 - w0 === 900_000n && l0 - l1 === 1_000_000n && at - bt === 100_000n, "win: winner +0.9 net, loser −1, fee account +0.1 (on-chain balances)");
  const log = await (await fetch(`http://127.0.0.1:${PORT}/matches/E2EWIN/log`)).json();
  ok(log.seed && log.slotHash && log.resultHash === done.payout.resultHash, "win: replay log published with seed + slot hash + result hash");
  const tx = await conn.getTransaction(done.payout.sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const ev = E.parseEvents(tx.meta.logMessages).find((e) => e.name === "Settled");
  ok(ev && ev.resultHash === done.payout.resultHash && ev.diceSeed === log.seed && ev.slotHash === log.slotHash, "win: Settled event = published result hash, seed and slot hash");
  A.ws.close(); B.ws.close();
}

// ── 2. Forfeit ──
{
  const b1 = await bal(p1.publicKey);
  const { A, B } = await seatBoth("E2EFFT", { stake: 1 });
  await A.wait((m) => m.type === "match.started", 30000);
  B.send({ type: "room.leave" });
  const done = await A.wait((m) => m.type === "match.completed", 60000);
  ok(done.winner === A.seat && done.payout?.sig, `forfeit: B left → A paid (${done.payout?.sig?.slice(0, 12)}…)`);
  ok((await bal(p1.publicKey)) - b1 === 900_000n, "forfeit: A +0.9 net on-chain");
  A.ws.close(); B.ws.close();
}

// ── 3. Cancel: B leaves before depositing → everyone refunded ──
{
  const b1 = await bal(p1.publicKey);
  const { A, B } = await seatBoth("E2ECXL", { deposit2: false });
  await A.wait((m) => m.type === "escrow.deposit.sent", 30000);
  ok((await bal(p1.publicKey)) === b1 - 1_000_000n, "cancel: A's 1 USDC is in the vault");
  B.send({ type: "room.leave" });
  const r = await refundedFor(A);
  ok(r.sig && r.reason === "player_left" && r.refunded.includes(p1.publicKey.toBase58()), `cancel: escrow.refunded player_left (${r.sig?.slice(0, 12)}…)`);
  ok((await bal(p1.publicKey)) === b1, "cancel: A's stake back on-chain");
  const tx = await conn.getTransaction(r.sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const ev = E.parseEvents(tx.meta.logMessages).find((e) => e.name === "Refunded");
  ok(ev && ev.reason === E.REASON.player_left && !ev.timeout, "cancel: Refunded event reason = player_left");
  A.ws.close(); B.ws.close();
}

// ── 4. Never deposits: B never signs → deposit deadline refund ──
{
  const b1 = await bal(p1.publicKey);
  const t0 = Date.now();
  const { A, B, esc } = await seatBoth("E2ENVR", { deposit2: false });
  ok(esc.depositDeadline && esc.depositMsLeft > 20000, "never-deposits: clients get the deposit deadline");
  const r = await refundedFor(A);
  ok(r.sig && r.reason === "deposit_timeout" && (await bal(p1.publicKey)) === b1, `never-deposits: refunded after ${Math.round((Date.now() - t0) / 1000)}s (${r.sig?.slice(0, 12)}…)`);
  A.ws.close(); B.ws.close();
}

// ── 5. Hard match limit: a second server with a 10s limit ends the match on standings and settles ──
{
  port = PORT + 1;
  startServer(port, { ESCROW_MATCH_LIMIT_SECS: "10", TURN_MS: "3000" });
  await waitServer(port);
  const bt = await bal(treasury);
  const { A, B } = await seatBoth("E2ELIM");
  await A.wait((m) => m.type === "match.started", 30000);
  const t0 = Date.now();
  const lim = await A.wait((m) => m.type === "match.time_limit", 30000);
  const done = await A.wait((m) => m.type === "match.completed", 30000);
  ok(lim.limitSecs === 10 && done.reason === "time_limit" && done.payout?.sig, `time limit: ended after ${Math.round((Date.now() - t0) / 1000)}s, settled to the leader (${done.payout?.sig?.slice(0, 12)}…)`);
  ok((await bal(treasury)) - bt === 100_000n, "time limit: fee account +0.1");
  A.ws.close(); B.ws.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) console.log(serverLog.split("\n").slice(-30).join("\n"));
cleanup();
process.exit(fail ? 1 : 0);

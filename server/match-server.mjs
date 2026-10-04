/**
 * Aura Match Server
 * Lightweight WebSocket server for authoritative multiplayer matches.
 * 
 * ARCHITECTURE NOTE: This server currently implements Ludo-specific rules.
 * Future enhancement: Make this game-agnostic by:
 * 1. Adding gameType parameter to room creation
 * 2. Implementing pluggable rule systems (ludo, chess, snakes)
 * 3. Moving game-specific constants to per-game rule modules
 * 
 * For now: Ludo is the only game with multiplayer. Chess and Snakes
 * use Free Play only (local/bot matches in the WebView).
 */
import { confirmDepositRequest } from "./escrowConfirm.mjs";
import { createHash } from "crypto";
import { createServer } from "http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import WebSocket, { WebSocketServer } from "ws"; // ws 8 (server/package.json)

const PORT = process.env.PORT || 3001;

// Ludo Constants matching games/ludo/game.js & docs/LUDO_RULEBOOK.md
const TRACK = 52;
const FINISH = 57;
const START = [17, 30, 4, 43]; // 0: Blue, 1: Yellow, 2: Green, 3: Red
const SAFE_CELLS = new Set([4, 12, 17, 25, 30, 38, 43, 51]);

// 2-Player mode uses opposite corners (Red 3 vs Blue 0)
const SEATS_2P = [3, 0];
// 4-Player mode uses clockwise corners (Red 3 -> Green 2 -> Blue 0 -> Yellow 1)
const SEATS_4P = [3, 2, 0, 1];
// 3-Player mode skips Yellow (1): Red 3 -> Green 2 -> Blue 0
const SEATS_3P = [3, 2, 0];
// Server turn clock per turn (roll + move). Matches the board's 20s timer.
const TURN_MS = Number(process.env.TURN_MS || 20000);

// Staked tables need ESCROW_LIVE=1 *and* a working on-chain escrow (server/escrow.mjs).
// Without it every table is a 0 USDC friendly, exactly as before.
const ESCROW_LIVE = process.env.ESCROW_LIVE === "1";
const HOUSE_FEE = 0.05;
const PAID_STAKES = [1, 3, 5, 10];
const ESCROW_POLL_MS = Number(process.env.ESCROW_POLL_MS || 1500);
// Hard match limit inside the on-chain refund window (v1.1: 60 min in a 2h window), and an
// alert if a locked room still isn't settled at 90 min. Both shrink with a short test window.
const MATCH_LIMIT_SECS = Number(process.env.ESCROW_MATCH_LIMIT_SECS || 3600);
const ALERT_AFTER_SECS = Number(process.env.ESCROW_ALERT_AFTER_SECS || 5400);
function escrowAlert(msg, extra = {}) {
  console.error(`[ALERT][escrow] ${msg}`, JSON.stringify(extra));
  const url = process.env.ESCROW_ALERT_URL;
  if (url) fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `[aura escrow] ${msg}`, ...extra }) }).catch(() => {});
}
let escrow = null; // ready EscrowService, or null
let escrowMod = null;
if (ESCROW_LIVE) {
  try {
    escrowMod = await import("./escrow.mjs");
    const svc = escrowMod.EscrowService.fromEnv();
    if (!svc) throw new Error("set ESCROW_AUTHORITY_KEYPAIR and a dedicated SOLANA_RPC");
    escrow = await svc.init();
    console.log(`[Aura Match Server] Escrow live: program ${svc.programId.toBase58()} mint ${svc.mint.toBase58()} (${svc.decimals} dp) rpc ${svc.rpc}`);
  } catch (e) {
    escrow = null;
    console.error(`[Aura Match Server] ESCROW_LIVE=1 but escrow is unavailable (${e.message}); staked tables are refused.`);
  }
}
const sha256 = (...parts) => {
  const h = createHash("sha256");
  for (const x of parts) h.update(x);
  return h.digest();
};
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
// Replayable logs for settled staked matches: GET /matches/<code>/log. Persisted next to
// history.json (MATCH_LOGS_FILE) so result_hash stays verifiable after a restart.
const matchLogs = new Map();
function escrowInfo() {
  return escrow
    ? {
        live: true,
        stakes: PAID_STAKES,
        feeBps: escrow.feeBps,
        mint: escrow.mint.toBase58(),
        decimals: escrow.decimals,
        programId: escrow.programId.toBase58(),
        cluster: escrow.cluster,
        depositSecs: escrow.depositWindowSecs,
        refundAfterSecs: escrow.refundAfterSecs,
        // RPC the phone submits deposits to. Unset → the app's own RPC setting. Set it for
        // localnet on a device (http://<mac-lan-ip>:8899). Never the server's keyed RPC.
        clientRpc: process.env.ESCROW_CLIENT_RPC || null,
      }
    : { live: false, stakes: [] };
}
function isWallet(w) {
  try {
    return !!w && !!new escrowMod.PublicKeyCtor(w);
  } catch {
    return false;
  }
}

// ── Match history (real server-completed matches only) ───────────────────────
const HISTORY_FILE = process.env.HISTORY_FILE ||
  join(dirname(fileURLToPath(import.meta.url)), "data", "history.json");
let history = [];
try {
  if (existsSync(HISTORY_FILE)) history = JSON.parse(readFileSync(HISTORY_FILE, "utf8"));
} catch {
  history = [];
}
function saveHistory() {
  try {
    mkdirSync(dirname(HISTORY_FILE), { recursive: true });
    writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-5000)));
  } catch (e) {
    console.error("[Aura Match Server] could not save history:", e.message);
  }
}

// Forfeits outlive their room for a while, so a late returner hears "forfeited".
// Persisted (with TTL) next to the history file so a server restart keeps them.
const FORFEITS_FILE = process.env.FORFEITS_FILE || join(dirname(HISTORY_FILE), "forfeits.json");
const recentForfeits = new Map(); // "CODE:playerId" -> expiresAt
try {
  if (existsSync(FORFEITS_FILE)) {
    const now = Date.now();
    for (const [k, t] of Object.entries(JSON.parse(readFileSync(FORFEITS_FILE, "utf8")))) {
      if (typeof t === "number" && t > now) recentForfeits.set(k, t);
    }
  }
} catch {}
const MATCH_LOGS_FILE = process.env.MATCH_LOGS_FILE || join(dirname(HISTORY_FILE), "matchlogs.json");
try {
  if (existsSync(MATCH_LOGS_FILE)) {
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(MATCH_LOGS_FILE, "utf8")))) matchLogs.set(k, v);
  }
} catch (err) {
  console.error("[matchlogs] couldn't read", MATCH_LOGS_FILE, err.message);
}
function saveMatchLogs() {
  try {
    while (matchLogs.size > 500) matchLogs.delete(matchLogs.keys().next().value);
    mkdirSync(dirname(MATCH_LOGS_FILE), { recursive: true });
    writeFileSync(MATCH_LOGS_FILE, JSON.stringify(Object.fromEntries(matchLogs)));
  } catch (err) {
    console.error("[matchlogs] couldn't write", MATCH_LOGS_FILE, err.message);
  }
}

function saveForfeits() {
  try {
    mkdirSync(dirname(FORFEITS_FILE), { recursive: true });
    writeFileSync(FORFEITS_FILE, JSON.stringify(Object.fromEntries(recentForfeits)));
  } catch (e) {
    console.error("[Aura Match Server] could not save forfeits:", e.message);
  }
}
function noteForfeit(code, playerId) {
  const now = Date.now();
  for (const [k, t] of recentForfeits) if (t < now) recentForfeits.delete(k);
  recentForfeits.set(`${code}:${playerId}`, now + 30 * 60 * 1000);
  saveForfeits();
}
function wasForfeited(code, playerId) {
  const t = recentForfeits.get(`${code}:${playerId}`);
  return !!t && t > Date.now();
}

// Seat held this long for the same playerId after a drop (BM: 30s grace, all modes).
const GRACE_MS = Number(process.env.GRACE_MS || 30000);
// Delay before the clock auto-moves after an auto-roll (so boards see the die land).
const AUTO_MOVE_MS = 900;

class LudoRoom {
  constructor(roomCode, mode = "2p", onDestroy = () => {}, opts = {}) {
    this.roomCode = roomCode;
    this.mode = mode;
    // Callers validate staked tables (escrow ready, stake in PAID_STAKES, wallets).
    this.stake = escrow && PAID_STAKES.includes(Number(opts.stake)) ? Number(opts.stake) : 0;
    // Escrow state for staked tables; friendly tables never touch the chain.
    this.esc = this.stake > 0
      ? { phase: "filling", seatState: {}, depositSig: {}, built: {}, wallets: [], pendingCancel: null }
      : null;
    this.moveLog = [];
    this.rollCount = 0;
    this.kind = opts.kind || "private"; // "private" | "quick"
    this.hostName = opts.hostName || null;
    this.createdAt = Date.now();
    // Everyone who sat down when the match started (for standings + history).
    this.roster = new Map();
    // playerIds whose seat forfeited — a returner gets "forfeited", not "room_full".
    this.forfeitedIds = new Set();
    this.seatOrder = mode === "2p" ? SEATS_2P : mode === "3p" ? SEATS_3P : SEATS_4P;
    this.maxPlayers = this.seatOrder.length;
    this.onDestroy = onDestroy;
    this.destroyed = false;

    // seat -> { ws, playerId, playerName, seat, connected, graceTimer, graceUntil }
    // A forfeited seat is deleted from this map and is out of the turn order.
    this.players = new Map();

    this.status = "waiting"; // "waiting" | "playing" | "completed"
    this.turnIndex = 0;
    this.currentSeat = this.seatOrder[0];
    this.die = null;
    this.sixStreak = 0;
    this.winner = null;
    this.pieces = [
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
    ];

    // One clock per turn (roll + move share the same TURN_MS deadline).
    this.turnTimer = null;
    this.turnEndsAt = null;
    // Bumped every turn; delayed callbacks from an old turn become no-ops.
    this.turnSeq = 0;
  }

  send(ws, msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  attach(ws, seat) {
    ws.room = this;
    ws.roomCode = this.roomCode;
    ws.seat = seat;
  }

  findSeatByPlayerId(playerId) {
    if (!playerId) return null;
    for (const [s, p] of this.players.entries()) if (p.playerId === playerId) return s;
    return null;
  }

  /** Staked table seat filling (no chain calls yet). */
  get escFilling() {
    return !!this.esc && this.esc.phase === "filling";
  }
  /** Staked table between init_room and lock (seats are held, money may be in the vault). */
  get escHolding() {
    return !!this.esc && ["initializing", "depositing"].includes(this.esc.phase);
  }

  addPlayer(ws, playerId, playerName = "Player", wallet = null) {
    const availableSeats = this.seatOrder.filter((s) => !this.players.has(s));
    if (availableSeats.length === 0 || this.status !== "waiting") return null;
    if (this.esc && !this.escFilling) return null;
    const seat = availableSeats[0];
    this.players.set(seat, {
      ws, playerId, playerName, seat, connected: true, graceTimer: null, graceUntil: null, wallet,
    });
    this.attach(ws, seat);
    if (this.players.size >= this.maxPlayers) {
      // Caller sends room.created/joined first, then we start (staked: open the vault first).
      setImmediate(() => {
        if (this.status !== "waiting" || this.destroyed) return;
        if (this.esc) this.beginEscrow();
        else this.startGame();
      });
    }
    this.broadcastState();
    return seat;
  }

  /**
   * Same playerId comes back (Retry, or a new socket before the old close landed).
   * Returns the seat, or null if this playerId isn't seated here.
   */
  rejoin(ws, playerId) {
    const seat = this.findSeatByPlayerId(playerId);
    if (seat === null) return null;
    const p = this.players.get(seat);
    const old = p.ws;
    if (this.escHolding && !p.connected) this.broadcast({ type: "player.joined", seat }, ws);
    // Only a seat that really dropped announces "back" (not a board re-mount).
    const wasAway = !p.connected || !!p.graceTimer;
    if (old && old !== ws) {
      old.room = null; // its close must not touch this seat
      try { old.close(); } catch {}
    }
    if (p.graceTimer) clearTimeout(p.graceTimer);
    p.graceTimer = null;
    p.graceUntil = null;
    p.ws = ws;
    p.connected = true;
    this.attach(ws, seat);
    if (this.status === "playing") {
      if (wasAway) this.broadcast({ type: "player.joined", seat }, ws);
      this.send(ws, {
        type: "match.resync",
        roomCode: this.roomCode,
        seats: this.seatOrder,
        yourSeat: seat,
        currentSeat: this.currentSeat,
        state: this.getSnapshot(),
      });
    }
    this.broadcastState();
    return seat;
  }

  /** Socket for `seat` went away (close/error). Stale sockets are ignored. */
  handleDisconnect(seat, ws) {
    const p = this.players.get(seat);
    if (!p || p.ws !== ws) return;
    if (this.status === "waiting" && this.escHolding) {
      // Staked table after it filled: the player may be in their wallet app. Hold the
      // seat until the deposit deadline (then everyone is refunded).
      p.ws = null;
      p.connected = false;
      this.broadcastState();
      return;
    }
    if (this.status === "waiting") {
      this.players.delete(seat);
      this.broadcastState();
      this.maybeDestroy();
      return;
    }
    p.ws = null;
    p.connected = false;
    if (this.status === "completed") {
      this.maybeDestroy();
      return;
    }
    // Playing: hold the seat for the same playerId. The turn clock still plays it.
    p.graceUntil = Date.now() + GRACE_MS;
    p.graceTimer = setTimeout(() => this.forfeit(seat, "grace_expired"), GRACE_MS);
    this.broadcast({ type: "player.left", seat, reconnecting: true, graceMs: GRACE_MS, graceUntil: p.graceUntil });
    this.broadcastState();
  }

  /** Explicit leave: waiting → free the seat; playing → forfeit now. */
  handleLeave(seat, ws) {
    const p = this.players.get(seat);
    if (!p || p.ws !== ws) return;
    ws.room = null;
    if (this.status === "playing") {
      this.forfeit(seat, "left");
    } else if (this.escHolding) {
      // Leaving a filled staked table cancels it: every deposit goes back.
      this.send(ws, { type: "escrow.cancelling", roomCode: this.roomCode, reason: "you_left" });
      this.escrowRefund("player_left");
    } else {
      this.players.delete(seat);
      this.broadcastState();
      this.maybeDestroy();
    }
  }

  /** Seat is out: leaves the turn order; 1 left → that player wins. */
  forfeit(seat, reason) {
    const p = this.players.get(seat);
    if (!p || this.status !== "playing") return;
    if (p.graceTimer) clearTimeout(p.graceTimer);
    this.players.delete(seat);
    if (p.playerId) {
      this.forfeitedIds.add(p.playerId);
      noteForfeit(this.roomCode, p.playerId);
    }
    if (this.esc) this.moveLog.push({ t: "forfeit", seat, reason });
    if (this.forfeitOrder) this.forfeitOrder.push(seat);
    this.broadcast({ type: "player.left", seat, forfeited: true, reason });
    const remaining = Array.from(this.players.keys());
    if (remaining.length <= 1) {
      this.complete(remaining.length ? remaining[0] : null, "opponent_disconnected");
    } else if (this.currentSeat === seat) {
      this.nextTurn(false);
    }
    this.broadcastState();
    this.maybeDestroy();
  }

  /** Winner first, then pieces home / distance, forfeited seats last (latest forfeit ranks higher). */
  standings(winner) {
    const progress = (s) => this.pieces[s].reduce((a, v) => a + Math.max(0, v + 1), 0);
    const out = (this.forfeitOrder || []).slice();
    const live = Array.from(this.roster.keys()).filter((s) => s !== winner && !out.includes(s));
    live.sort((a, b) => progress(b) - progress(a));
    const order = [...(winner != null ? [winner] : []), ...live, ...out.reverse()];
    return order.map((s, i) => ({
      seat: s,
      name: this.roster.get(s)?.name || "Player",
      place: i + 1,
      forfeited: (this.forfeitOrder || []).includes(s),
    }));
  }

  complete(winner, reason) {
    this.winner = winner;
    this.status = "completed";
    this.clearTurnTimer();
    this.turnSeq++;
    for (const p of this.players.values()) {
      if (p.graceTimer) clearTimeout(p.graceTimer);
      p.graceTimer = null;
    }
    const standings = this.standings(winner);
    if (this.esc && this.esc.phase === "locked") {
      this.escrowSettle(winner, reason, standings);
      return;
    }
    this.recordHistory(winner, standings);
    this.broadcast({ type: "match.completed", winner, reason, standings, stake: this.stake });
  }

  recordHistory(winner, standings, payoutInfo = null) {
    const n = this.roster.size;
    const pot = this.stake * n;
    const payout = payoutInfo ? payoutInfo.amount : +(pot - pot * HOUSE_FEE).toFixed(2);
    const endedAt = Date.now();
    const winnerName = this.roster.get(winner)?.name || null;
    for (const [seat, r] of this.roster.entries()) {
      const won = seat === winner;
      history.push({
        id: `${this.roomCode}-${this.createdAt}-${seat}`,
        playerId: r.playerId,
        game: "Ludo",
        code: this.roomCode,
        kind: this.kind,
        players: n,
        stake: this.stake,
        result: won ? "won" : "lost",
        place: standings.find((x) => x.seat === seat)?.place ?? null,
        delta: this.stake > 0 ? (won ? +(payout - this.stake).toFixed(2) : -this.stake) : 0,
        winnerName,
        endedAt,
        ...(this.esc
          ? {
              depositSig: this.esc.depositSig[seat] || null,
              payoutSig: payoutInfo?.sig || null,
              payoutUrl: payoutInfo?.url || null,
              payout: won ? payout : 0,
            }
          : {}),
      });
    }
    saveHistory();
  }

  /** Public table card for Join-by-code (no ids, no sockets). */
  info() {
    return {
      roomCode: this.roomCode,
      host: this.hostName,
      mode: this.mode,
      maxPlayers: this.maxPlayers,
      seated: this.players.size,
      stake: this.stake,
      status: this.status,
    };
  }

  /** No live socket left and nothing to wait for → free the code + timers. */
  maybeDestroy() {
    if (this.destroyed) return;
    // A filled staked table waits for its deposit deadline / refund, not for sockets.
    if (this.esc && ["initializing", "depositing", "refunding"].includes(this.esc.phase)) return;
    const anyConnected = Array.from(this.players.values()).some((p) => p.connected);
    const anyGrace = Array.from(this.players.values()).some((p) => p.graceTimer);
    if (!anyConnected && !(this.status === "playing" && anyGrace)) this.destroy();
  }

  destroy() {
    if (this.destroyed) return;
    if (this.escHolding) this.escrowRefund("cancelled");
    else if (this.esc && this.esc.phase === "locked" && this.status !== "completed") this.escrowRefund("abandoned");
    this.destroyed = true;
    this.clearTurnTimer();
    this.turnSeq++;
    for (const p of this.players.values()) {
      if (p.graceTimer) clearTimeout(p.graceTimer);
      p.graceTimer = null;
    }
    this.onDestroy(this);
  }

  /** One clock per turn: at the deadline, roll if needed, then move the first legal piece. */
  armTurnTimer() {
    this.clearTurnTimer();
    if (this.status !== "playing") return;
    const seat = this.currentSeat;
    const token = this.turnSeq;
    this.turnEndsAt = Date.now() + TURN_MS;
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      if (this.status !== "playing" || this.turnSeq !== token || this.currentSeat !== seat) return;
      if (this.die === null) {
        this.handleRoll(seat, { auto: true });
      } else {
        this.autoMove(seat, token);
      }
    }, TURN_MS);
  }

  autoMove(seat, token) {
    if (this.status !== "playing" || this.turnSeq !== token || this.currentSeat !== seat || this.die === null) return;
    const legal = this.getLegalMoves(seat, this.die);
    if (legal.length > 0) this.handleMove(seat, legal[0].idx);
    else this.nextTurn(false);
  }

  clearTurnTimer() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.turnEndsAt = null;
  }

  startGame() {
    this.status = "playing";
    // Staked tables can lock while someone is still in their wallet app: start their grace now.
    for (const [seat, p] of this.players) {
      if (!p.connected && !p.graceTimer) {
        p.graceUntil = Date.now() + GRACE_MS;
        p.graceTimer = setTimeout(() => this.forfeit(seat, "grace_expired"), GRACE_MS);
      }
    }
    this.roster = new Map(
      Array.from(this.players.entries()).map(([s, p]) => [s, { playerId: p.playerId, name: p.playerName }])
    );
    this.forfeitOrder = [];
    this.turnIndex = 0;
    this.currentSeat = this.seatOrder[0];
    this.die = null;
    this.sixStreak = 0;
    this.turnSeq++;
    this.armTurnTimer();
    for (const p of this.players.values()) {
      this.send(p.ws, {
        type: "match.started",
        roomCode: this.roomCode,
        seats: this.seatOrder,
        yourSeat: p.seat,
        currentSeat: this.currentSeat,
        state: this.getSnapshot(),
      });
    }
  }

  getSnapshot() {
    const playersObj = {};
    for (const [s, p] of this.players.entries()) {
      playersObj[s] = { name: p.playerName, seat: s, connected: p.connected, graceUntil: p.graceUntil };
    }
    return {
      roomCode: this.roomCode,
      status: this.status,
      mode: this.mode,
      stake: this.stake,
      maxPlayers: this.maxPlayers,
      seats: this.seatOrder,
      currentSeat: this.currentSeat,
      die: this.die,
      sixStreak: this.sixStreak,
      pieces: this.pieces,
      winner: this.winner,
      players: playersObj,
      turnMs: TURN_MS,
      turnEndsAt: this.turnEndsAt,
      // Clock-skew-free: clients set deadline = their now + turnMsLeft.
      turnMsLeft: this.turnEndsAt ? Math.max(0, this.turnEndsAt - Date.now()) : null,
      legalMoves: this.die !== null ? this.getLegalMoves(this.currentSeat, this.die) : [],
      ...(this.esc ? { escrow: this.escrowSnapshot() } : {}),
    };
  }

  // ── On-chain escrow (staked tables only) ─────────────────────────────────
  escrowSnapshot() {
    const e = this.esc;
    const ui = (b) => (b == null ? null : escrow ? escrow.toUi(b) : null);
    const m = e.stakeBase != null && escrow ? escrowMod.payoutFor(e.stakeBase, this.maxPlayers, escrow.feeBps) : null;
    const seats = {};
    for (const [s, p] of this.players.entries()) {
      seats[s] = {
        chainSeat: this.seatOrder.indexOf(s),
        wallet: p.wallet || null,
        state: e.seatState[s] || "waiting",
        sig: e.depositSig[s] || null,
      };
    }
    return {
      phase: e.phase,
      programId: escrow?.programId.toBase58() ?? null,
      mint: escrow?.mint.toBase58() ?? null,
      decimals: escrow?.decimals ?? null,
      cluster: escrow?.cluster ?? null,
      room: e.room ? e.room.toBase58() : null,
      vault: e.vault ? e.vault.toBase58() : null,
      stake: this.stake,
      feeBps: escrow?.feeBps ?? 500,
      pot: m ? ui(m.pot) : this.stake * this.maxPlayers,
      fee: m ? ui(m.fee) : +(this.stake * this.maxPlayers * HOUSE_FEE).toFixed(2),
      payout: m ? ui(m.payout) : +(this.stake * this.maxPlayers * (1 - HOUSE_FEE)).toFixed(2),
      depositDeadline: e.depositDeadline ? e.depositDeadline * 1000 : null,
      depositMsLeft: e.depositDeadline ? Math.max(0, e.depositDeadline * 1000 - Date.now()) : null,
      refundAfterSecs: escrow?.refundAfterSecs ?? null,
      initSig: e.initSig || null,
      initUrl: e.initSig && escrow ? escrowMod.explorerTx(e.initSig, escrow.cluster) : null,
      commit: e.commit ? e.commit.toString("hex") : null,
      seats,
      error: e.error || null,
    };
  }

  /** Table filled: open the vault with each seat bound to its player's wallet. */
  async beginEscrow() {
    const e = this.esc;
    e.phase = "initializing";
    e.wallets = this.seatOrder.map((s) => this.players.get(s)?.wallet || null);
    this.broadcastState();
    try {
      const r = await escrow.initRoom({ seats: this.seatOrder.length, stakeUi: this.stake, players: e.wallets });
      Object.assign(e, {
        room: r.room, vault: r.vault, roomId: r.roomId, seed: r.seed, commit: r.commit,
        stakeBase: r.stake, depositDeadline: r.depositDeadline, initSig: r.sig, phase: "depositing",
      });
      console.log(`[escrow] ${this.roomCode} init_room ${r.sig} room ${r.room.toBase58()}`);
      if (e.pendingCancel) return this.escrowRefund(e.pendingCancel);
      e.deadlineTimer = setTimeout(() => this.escrowRefund("deposit_timeout"), Math.max(0, r.depositDeadline * 1000 - Date.now()) + 1500);
      e.pollTimer = setInterval(() => this.escrowPoll(), ESCROW_POLL_MS);
      this.broadcastState();
    } catch (err) {
      console.error(`[escrow] ${this.roomCode} init_room failed:`, err.message);
      e.phase = "failed";
      e.error = "Couldn't open the table vault. No money moved.";
      this.broadcastState();
      this.broadcast({ type: "escrow.failed", roomCode: this.roomCode, message: e.error });
      this.releaseAll();
    }
  }

  /** A seat is Ready only when the room account shows its deposit from the bound wallet. */
  async escrowPoll() {
    const e = this.esc;
    if (e.phase !== "depositing" || e.polling) return;
    e.polling = true;
    try {
      const st = await escrow.fetchRoom(e.room);
      if (!st || e.phase !== "depositing") return;
      const problem = escrow.roomProblem(st, { stake: e.stakeBase, seats: this.seatOrder.length });
      if (problem) {
        escrowAlert(`room ${this.roomCode} account doesn't match: ${problem}`, { room: e.room.toBase58() });
        return;
      }
      let changed = false;
      let all = true;
      this.seatOrder.forEach((s, i) => {
        const funded = (st.deposited & (1 << i)) !== 0 && st.players[i].toBase58() === e.wallets[i];
        if (funded && e.seatState[s] !== "ready") {
          e.seatState[s] = "ready";
          changed = true;
        }
        if (!funded) all = false;
      });
      if (all && st.status === escrowMod.ROOM_LOCKED) {
        clearInterval(e.pollTimer);
        clearTimeout(e.deadlineTimer);
        e.phase = "locked";
        e.settleDeadline = st.settleDeadline;
        e.lockedAt = st.lockedAt;
        e.slotHash = Buffer.from(st.lockSlotHash); // dice = seed ⊕ this slot hash
        this.broadcastState();
        try {
          e.startSig = await escrow.startMatch(e.room); // first roll marked on-chain
        } catch (err) {
          console.error(`[escrow] ${this.roomCode} start_match failed:`, err.message);
          e.phase = "depositing"; // lets escrowRefund run; not started → no reason needed
          return this.escrowRefund("server_error");
        }
        this.armEscrowClocks();
        if (!this.destroyed) this.startGame();
      } else if (changed) this.broadcastState();
    } catch (err) {
      console.error(`[escrow] ${this.roomCode} poll:`, err.message);
    } finally {
      e.polling = false;
    }
  }

  /** 60-min hard match limit + 90-min unsettled alert, both inside settle_deadline. */
  armEscrowClocks() {
    const e = this.esc;
    const windowSecs = Math.max(60, e.settleDeadline - e.lockedAt);
    const limit = Math.min(MATCH_LIMIT_SECS, Math.floor(windowSecs * 0.5));
    const alertAt = Math.min(ALERT_AFTER_SECS, Math.floor(windowSecs * 0.75));
    e.limitTimer = setTimeout(() => {
      if (this.status !== "playing") return;
      const live = this.standings(null).filter((x) => !x.forfeited);
      this.broadcast({ type: "match.time_limit", roomCode: this.roomCode, limitSecs: limit });
      this.complete(live.length ? live[0].seat : null, "time_limit");
    }, limit * 1000);
    e.alertTimer = setTimeout(() => {
      if (e.phase !== "settled" && e.phase !== "refunded") {
        escrowAlert(`room ${this.roomCode} not settled ${alertAt}s after lock`, { room: e.room.toBase58(), phase: e.phase, settleDeadline: e.settleDeadline });
      }
    }, alertAt * 1000);
  }

  clearEscrowClocks() {
    if (!this.esc) return;
    clearTimeout(this.esc.limitTimer);
    clearTimeout(this.esc.alertTimer);
  }

  /** Server-built deposit tx for this seat's bound wallet to sign. */
  async escrowBuildDeposit(ws) {
    const e = this.esc;
    const seat = ws.seat;
    const p = this.players.get(seat);
    if (!p || p.ws !== ws) return;
    if (e.phase !== "depositing") return this.send(ws, { type: "error", error: "escrow_not_ready", message: "The table vault isn't open yet." });
    if (e.seatState[seat] === "ready") return this.send(ws, { type: "error", error: "already_deposited", message: "Your stake is already locked." });
    try {
      const b = await escrow.buildDepositTx({ wallet: p.wallet, room: e.room, chainSeat: this.seatOrder.indexOf(seat) });
      e.built[seat] = b.message;
      e.seatState[seat] = "signing";
      this.send(ws, { type: "escrow.deposit.tx", roomCode: this.roomCode, tx: b.tx, stake: this.stake, wallet: p.wallet });
      this.broadcastState();
    } catch (err) {
      this.send(ws, { type: "error", error: "deposit_build_failed", message: "Couldn't prepare the deposit. Try again." });
    }
  }

  /** Seat shows "Depositing…" while the player is in their wallet (never Ready from this). */
  escrowSeatSigning(ws, active) {
    const e = this.esc;
    const p = this.players.get(ws.seat);
    if (!p || p.ws !== ws || e.phase !== "depositing" || e.seatState[ws.seat] === "ready") return;
    e.seatState[ws.seat] = active ? "signing" : "waiting";
    this.broadcastState();
  }

  /**
   * Confirm-deposit for a tx the app submitted itself: read the room account (the only
   * source of Ready). Retries the read briefly for RPC lag; the sig is informational.
   */
  async escrowConfirmDeposit(ws, sig) {
    const e = this.esc;
    const seat = ws.seat;
    const p = this.players.get(seat);
    const reply = (m) => this.send(ws, {
      type: "escrow.deposit.confirmed", roomCode: this.roomCode, ...m,
      url: m.sig ? escrowMod.explorerTx(m.sig, escrow.cluster) : null,
    });
    if (!p || p.ws !== ws) return reply({ ok: false, error: "not_seated", message: "You're not seated at this table." });
    if (e.room && e.seatState[seat] !== "ready" && e.phase === "depositing" && !ws._escrowConfirming) {
      e.seatState[seat] = "depositing";
      this.broadcastState();
    }
    await confirmDepositRequest({
      ws, room: e.room, chainSeat: this.seatOrder.indexOf(seat), wallet: p.wallet,
      stake: e.stakeBase, seats: this.seatOrder.length, sig, escrow, reply,
      onReady: (verifiedSig) => {
        if (verifiedSig) e.depositSig[seat] = verifiedSig; // only after on-chain verification
        if (e.phase === "depositing" && e.seatState[seat] !== "ready") {
          e.seatState[seat] = "ready"; // from the room-account read
          this.broadcastState();
        }
        this.escrowPoll(); // locks + starts once every seat is funded
      },
      onNotReady: () => {
        if (e.seatState[seat] !== "ready" && e.phase === "depositing") {
          e.seatState[seat] = "waiting";
          this.broadcastState();
        }
      },
    });
  }

  /** Relay the wallet-signed deposit (only the exact tx we built for this seat). */
  async escrowSubmitDeposit(ws, signedTx) {
    const e = this.esc;
    const seat = ws.seat;
    const p = this.players.get(seat);
    if (!p || p.ws !== ws || e.phase !== "depositing" || !e.built[seat]) return;
    e.seatState[seat] = "depositing";
    this.broadcastState();
    try {
      const r = await escrow.submitAndConfirmDeposit({
        signedTx: String(signedTx || ""), expectMessage: e.built[seat],
        room: e.room, chainSeat: this.seatOrder.indexOf(seat), wallet: p.wallet,
        stake: e.stakeBase, seats: this.seatOrder.length,
      });
      e.depositSig[seat] = r.sig;
      // Ready comes only from the room account read (confirm-deposit / poll), never the sig.
      this.send(ws, { type: "escrow.deposit.sent", roomCode: this.roomCode, sig: r.sig, url: r.url, confirmed: r.confirmed });
      this.escrowPoll();
    } catch (err) {
      if (e.seatState[seat] !== "ready") e.seatState[seat] = "waiting";
      this.send(ws, { type: "error", error: "deposit_failed", message: String(err.message || err).slice(0, 200) });
      this.broadcastState();
    }
  }

  /** Cancel / timeout / never-deposits / no winner: every deposit back to its own wallet. */
  async escrowRefund(reason) {
    const e = this.esc;
    if (!e) return;
    if (e.phase === "initializing") {
      e.pendingCancel = e.pendingCancel || reason;
      return;
    }
    if (!["depositing", "locked"].includes(e.phase)) return;
    clearInterval(e.pollTimer);
    clearTimeout(e.deadlineTimer);
    this.clearEscrowClocks();
    e.phase = "refunding";
    this.broadcastState();
    let res = null;
    let gone = false;
    for (let a = 0; a < 3 && !res && !gone; a++) {
      try {
        res = await escrow.refund({ room: e.room, reason: escrowMod.REASON[reason] ?? escrowMod.REASON.server_error });
        if (!res) gone = true;
      } catch (err) {
        console.error(`[escrow] ${this.roomCode} refund try ${a + 1}:`, err.message);
        await sleep(1500);
      }
    }
    e.phase = res || gone ? "refunded" : "refund_failed";
    const msg = {
      type: "escrow.refunded",
      roomCode: this.roomCode,
      reason,
      stake: this.stake,
      sig: res?.sig || null,
      url: res?.url || null,
      refunded: res?.refunded || [],
      error: res || gone ? null : "Refund is delayed. Anyone can release it after the deposit deadline.",
    };
    e.refund = msg;
    console.log(`[escrow] ${this.roomCode} refund (${reason}) ${res?.sig || "(no tx)"}`);
    const endedAt = Date.now();
    for (const [seat, p] of this.players.entries()) {
      if (!p.wallet || !msg.refunded.includes(p.wallet)) continue;
      history.push({
        id: `${this.roomCode}-${this.createdAt}-${seat}-refund`,
        playerId: p.playerId, game: "Ludo", code: this.roomCode, kind: this.kind,
        players: this.maxPlayers, stake: this.stake, result: "refunded", place: null, delta: 0,
        winnerName: null, endedAt, refundSig: msg.sig, refundUrl: msg.url, reason,
        depositSig: e.depositSig[seat] || null,
      });
    }
    saveHistory();
    this.broadcast(msg);
    if (this.status !== "completed") this.releaseAll();
  }

  /** Winner (or last seat after forfeits) gets pot − 5% from the vault; seed revealed on-chain. */
  async escrowSettle(winner, reason, standings) {
    const e = this.esc;
    if (winner == null) {
      this.recordHistory(null, standings);
      this.broadcast({ type: "match.completed", winner, reason, standings, stake: this.stake });
      return this.escrowRefund("no_winner");
    }
    e.phase = "settling";
    this.clearEscrowClocks();
    const m = escrowMod.payoutFor(e.stakeBase, this.maxPlayers, escrow.feeBps);
    const resultHash = sha256(e.roomId, JSON.stringify(this.moveLog), JSON.stringify(standings));
    const base = {
      amount: escrow.toUi(m.payout), fee: escrow.toUi(m.fee), pot: escrow.toUi(m.pot),
      winnerSeat: winner, resultHash: resultHash.toString("hex"), logUrl: `/matches/${this.roomCode}/log`,
    };
    // Settle right away; keep retrying until 30s before settle_deadline (then only the
    // timeout refund remains, which anyone can call).
    const settleP = (async () => {
      for (let a = 0; ; a++) {
        try {
          return await escrow.settle({ room: e.room, winnerSeat: this.seatOrder.indexOf(winner), resultHash, seed: e.seed });
        } catch (err) {
          console.error(`[escrow] ${this.roomCode} settle try ${a + 1}:`, err.message);
          if (/custom program error|SettleExpired|NotStarted|BadStatus|AccountNotInitialized/.test(String(err.message))) return null;
          if (Date.now() / 1000 > e.settleDeadline - 30) return null;
          await sleep(Math.min(30000, 1500 * (a + 1)));
        }
      }
    })();
    const first = await Promise.race([settleP, sleep(20000).then(() => undefined)]);
    const payout = first ? { ...base, sig: first.sig, url: first.url } : { ...base, pending: first === undefined, error: first === null ? "settle_failed" : undefined };
    matchLogs.set(this.roomCode, {
      roomCode: this.roomCode, roomId: e.roomId.toString("hex"), room: e.room.toBase58(),
      commit: e.commit.toString("hex"), seed: e.seed.toString("hex"), slotHash: e.slotHash?.toString("hex") ?? null,
      dice: "roll n = 1 + (first byte < 252 of sha256(seed ‖ slotHash ‖ `n:k`)) mod 6", log: this.moveLog, standings,
      resultHash: base.resultHash, settleSig: first?.sig || null,
    });
    saveMatchLogs();
    this.recordHistory(winner, standings, payout);
    this.broadcast({ type: "match.completed", winner, reason, standings, stake: this.stake, payout });
    e.phase = first ? "settled" : first === null ? "settle_failed" : "settling";
    console.log(`[escrow] ${this.roomCode} settle ${first?.sig || "(pending)"}`);
    if (first === undefined) {
      const late = await settleP;
      e.phase = late ? "settled" : "settle_failed";
      if (!late) escrowAlert(`settle failed for ${this.roomCode}; players can timeout-refund after ${new Date(e.settleDeadline * 1000).toISOString()}`, { room: e.room.toBase58() });
      if (late) {
        const lp = { ...base, sig: late.sig, url: late.url };
        const log = matchLogs.get(this.roomCode);
        if (log) {
          log.settleSig = late.sig;
          saveMatchLogs();
        }
        for (const h of history) if (h.code === this.roomCode && h.id.startsWith(`${this.roomCode}-${this.createdAt}-`)) { h.payoutSig = late.sig; h.payoutUrl = late.url; }
        saveHistory();
        this.broadcast({ type: "escrow.settled", roomCode: this.roomCode, payout: lp });
      }
    }
  }

  /** Detach every socket so players can sit elsewhere, then free the code. */
  releaseAll() {
    for (const p of this.players.values()) {
      if (p.ws) p.ws.room = null;
      if (p.graceTimer) clearTimeout(p.graceTimer);
      p.graceTimer = null;
    }
    this.destroy();
  }

  broadcast(msg, except = null) {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.ws && p.ws !== except && p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(data);
      }
    }
  }

  broadcastState() {
    this.broadcast({
      type: "room.state",
      state: this.getSnapshot(),
    });
  }

  getLegalMoves(seat, rollValue) {
    const moves = [];
    const playerPieces = this.pieces[seat];
    for (let idx = 0; idx < 4; idx++) {
      const prog = playerPieces[idx];
      if (prog < 0) {
        // In yard: requires a 6 to enter start cell (progress 0)
        if (rollValue === 6) {
          moves.push({ seat, idx, from: prog, to: 0 });
        }
      } else if (prog < FINISH) {
        const next = prog + rollValue;
        if (next <= FINISH) {
          moves.push({ seat, idx, from: prog, to: next });
        }
      }
    }
    return moves;
  }

  /** Friendly: Math.random. Staked: derived from the committed seed + roll number (replayable). */
  rollDie() {
    // TEST_DICE is a comma-separated script for friendly-room tests only.
    // Staked dice stay commit-reveal and never read it.
    if (!this.esc && process.env.TEST_DICE) {
      const script = String(process.env.TEST_DICE)
        .split(",")
        .map((n) => Number(n.trim()))
        .filter((n) => n >= 1 && n <= 6);
      if (script.length) {
        const v = script[this.rollCount % script.length];
        this.rollCount++;
        return v;
      }
    }
    if (!this.esc) return 1 + Math.floor(Math.random() * 6);
    // Staked: the dice MUST mix the committed seed with the lock-time slot hash. No fallback.
    if (!this.esc.seed || !this.esc.slotHash || this.esc.slotHash.length !== 32) {
      throw new Error(`staked room ${this.roomCode}: missing seed or lock slot hash`);
    }
    const n = this.rollCount++;
    for (let k = 0; ; k++) {
      const h = sha256(this.esc.seed, this.esc.slotHash, `${n}:${k}`);
      for (const b of h) if (b < 252) return 1 + (b % 6);
    }
  }

  handleRoll(seat, opts = {}) {
    if (this.status !== "playing" || this.currentSeat !== seat || this.die !== null) {
      return false;
    }
    const token = this.turnSeq;

    let value;
    try {
      value = this.rollDie();
    } catch (err) {
      // Never roll staked dice without the slot hash: stop the match and refund everyone.
      escrowAlert(err.message, { room: this.esc?.room?.toBase58?.() });
      this.clearTurnTimer();
      this.escrowRefund("server_error");
      return false;
    }
    this.die = value;
    if (this.esc) this.moveLog.push({ t: "roll", seat, v: value });
    this.sixStreak = value === 6 ? this.sixStreak + 1 : 0;

    // 3 consecutive sixes: turn is forfeited. Stop the clock so it can't also end this turn.
    if (this.sixStreak >= 3) {
      this.clearTurnTimer();
      this.sixStreak = 0;
      this.broadcast({ type: "die.rolled", seat, value, sixStreak: 3, forfeited: true });
      setTimeout(() => { if (this.turnSeq === token) this.nextTurn(false); }, 800);
      return true;
    }

    const legal = this.getLegalMoves(seat, value);
    this.broadcast({ type: "die.rolled", seat, value, sixStreak: this.sixStreak, legalMoves: legal, auto: !!opts.auto });

    if (legal.length === 0) {
      // No move: stop the clock first, then pass once (turn token guards double-advance).
      this.clearTurnTimer();
      const extraOnSix = value === 6;
      setTimeout(() => { if (this.turnSeq === token) this.nextTurn(extraOnSix); }, 700);
    } else if (opts.auto) {
      // Clock already expired for this turn: move right after the die lands.
      setTimeout(() => this.autoMove(seat, token), AUTO_MOVE_MS);
    }
    // Manual roll with legal moves: the same turn clock keeps running for the move.
    return true;
  }

  handleMove(seat, pieceIdx) {
    if (this.status !== "playing" || this.currentSeat !== seat || this.die === null) {
      return false;
    }

    const rollValue = this.die;
    const legal = this.getLegalMoves(seat, rollValue);
    const validMove = legal.find((m) => m.idx === pieceIdx);
    if (!validMove) {
      return false;
    }

    const from = this.pieces[seat][pieceIdx];
    const to = validMove.to;
    this.pieces[seat][pieceIdx] = to;
    if (this.esc) this.moveLog.push({ t: "move", seat, i: pieceIdx, to });

    // Check for captures
    let captured = 0;
    if (to < TRACK) {
      const absPos = (START[seat] + to) % TRACK;
      if (!SAFE_CELLS.has(absPos)) {
        for (const oppSeat of this.seatOrder) {
          if (oppSeat === seat) continue;
          for (let oppIdx = 0; oppIdx < 4; oppIdx++) {
            const oppProg = this.pieces[oppSeat][oppIdx];
            if (oppProg >= 0 && oppProg < TRACK) {
              const oppAbs = (START[oppSeat] + oppProg) % TRACK;
              if (oppAbs === absPos) {
                // Send back to yard
                this.pieces[oppSeat][oppIdx] = -1;
                captured += 1;
              }
            }
          }
        }
      }
    }

    const homed = to === FINISH;
    const won = this.pieces[seat].every((p) => p === FINISH);

    this.broadcast({
      type: "piece.moved",
      seat,
      pieceIndex: pieceIdx,
      from,
      to,
      captured,
      homed,
    });

    if (won) {
      this.complete(seat, "all_tokens_home");
      return true;
    }

    // Extra turn condition: rolled 6, captured opponent, or reached home
    const extraTurn = rollValue === 6 || captured > 0 || homed;
    this.nextTurn(extraTurn);
    return true;
  }

  nextTurn(extraTurn) {
    if (this.status !== "playing") return;
    this.turnSeq++;
    this.clearTurnTimer();
    this.die = null;
    // A bonus turn for a seat that just left becomes a normal pass.
    if (extraTurn && !this.players.has(this.currentSeat)) extraTurn = false;
    if (!extraTurn) {
      this.sixStreak = 0;
      // Skip seats whose player has left.
      for (let i = 0; i < this.seatOrder.length; i++) {
        this.turnIndex = (this.turnIndex + 1) % this.seatOrder.length;
        if (this.players.has(this.seatOrder[this.turnIndex])) break;
      }
      this.currentSeat = this.seatOrder[this.turnIndex];
    }
    this.armTurnTimer();
    this.broadcast({
      type: "turn.changed",
      currentSeat: this.currentSeat,
      extraTurn: !!extraTurn,
      turnEndsAt: this.turnEndsAt,
      turnMsLeft: this.turnEndsAt ? TURN_MS : null,
    });
  }
}

// Global rooms registry & matchmaking queue
const rooms = new Map();
// Quick match: one queue per (player count, stake). Only real players, never bots.
const queues = new Map(); // "2p:0" -> [{ ws, playerId, playerName }]
const queueKey = (players, stake) => `${players}p:${stake}`;
function queueSize() {
  let n = 0;
  for (const q of queues.values()) n += q.length;
  return n;
}
function leaveQueues(ws) {
  for (const [k, q] of queues.entries()) {
    const i = q.findIndex((e) => e.ws === ws);
    if (i === -1) continue;
    q.splice(i, 1);
    if (q.length === 0) {
      queues.delete(k);
      continue;
    }
    // Tell whoever is still waiting the new count.
    const [p, st] = k.split(":");
    const players = Number(p.replace("p", ""));
    const stake = Number(st);
    for (const e of q) {
      if (e.ws.readyState === WebSocket.OPEN) {
        e.ws.send(JSON.stringify({ type: "queue.waiting", players, stake, waiting: q.length }));
      }
    }
  }
}

function makeRoom(roomCode, mode, opts = {}) {
  const room = new LudoRoom(roomCode, mode, (r) => {
    if (rooms.get(r.roomCode) === r) rooms.delete(r.roomCode);
  }, opts);
  rooms.set(roomCode, room);
  return room;
}

/** Staked create/join/queue checks. Returns [error, message] or null. */
function stakedProblem(msg) {
  const stake = Number(msg.stake) || 0;
  if (stake <= 0 || !ESCROW_LIVE) return null; // friendly (or escrow off: coerced to 0 as before)
  if (!escrow) return ["escrow_unavailable", "Staked tables are off right now. Play a friendly."];
  if (!PAID_STAKES.includes(stake)) return ["bad_stake", `Stakes are ${PAID_STAKES.join(" / ")} USDC.`];
  if (!isWallet(msg.wallet)) return ["wallet_required", "Connect a wallet to join a staked table."];
  return null;
}

function sendErr(ws, error, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "error", error, message }));
}

function freshCode(prefix) {
  let code;
  do code = prefix + Math.floor(1000 + Math.random() * 9000);
  while (rooms.has(code));
  return code;
}

const server = createServer((req, res) => {
  const logMatch = /^\/matches\/([A-Za-z0-9-]+)\/log\/?$/.exec(req.url || "");
  if (logMatch) {
    const log = matchLogs.get(logMatch[1].toUpperCase());
    res.writeHead(log ? 200 : 404, { "Content-Type": "application/json" });
    res.end(JSON.stringify(log || { error: "not_found" }));
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      name: "aura-match-server",
      status: "healthy",
      roomsCount: rooms.size,
      queuedRandom: queueSize(),
      escrowLive: !!escrow,
    })
  );
});

const wss = new WebSocketServer({ server });

function onMessage(ws, msg) {
  switch (msg.type) {
    case "room.create": {
      if (ws.room) return sendErr(ws, "already_seated", "Leave your current table first.");
      const roomCode = msg.roomCode ? String(msg.roomCode).toUpperCase().trim() : freshCode("LUDO-");
      if (rooms.has(roomCode)) {
        // Never replace a live table (e.g. a Retry that re-sends create).
        return sendErr(ws, "room_exists", `Room ${roomCode} already exists.`);
      }
      const mode = ["2p", "3p", "4p"].includes(msg.mode) ? msg.mode : "2p";
      const hostName = msg.playerName || "Player 1";
      const bad = stakedProblem(msg);
      if (bad) return sendErr(ws, bad[0], bad[1]);
      const room = makeRoom(roomCode, mode, { stake: msg.stake, hostName, kind: "private" });
      const seat = room.addPlayer(ws, msg.playerId || "anon-" + Math.random(), hostName, room.esc ? String(msg.wallet) : null);
      ws.send(JSON.stringify({ type: "room.created", roomCode, seat, mode, state: room.getSnapshot() }));
      break;
    }

    case "room.join": {
      const roomCode = String(msg.roomCode || "").toUpperCase().trim();
      const room = rooms.get(roomCode);
      if (!room && msg.playerId && wasForfeited(roomCode, msg.playerId)) {
        return sendErr(ws, "forfeited", "Your seat at this table was forfeited.");
      }
      if (!room) return sendErr(ws, "room_not_found", `Room ${roomCode} does not exist.`);
      if (ws.room && ws.room !== room) return sendErr(ws, "already_seated", "Leave your current table first.");

      // Same playerId → give back the held seat (grace) with a full snapshot.
      if (msg.playerId && room.forfeitedIds.has(msg.playerId)) {
        return sendErr(ws, "forfeited", "Your seat at this table was forfeited.");
      }
      const back = room.rejoin(ws, msg.playerId);
      if (back !== null) {
        ws.send(JSON.stringify({ type: "room.joined", roomCode, seat: back, mode: room.mode, rejoined: true, state: room.getSnapshot() }));
        return;
      }
      if (room.esc) {
        const bad = stakedProblem({ ...msg, stake: room.stake });
        if (bad) return sendErr(ws, bad[0], bad[1]);
        if (Array.from(room.players.values()).some((p) => p.wallet === String(msg.wallet))) {
          return sendErr(ws, "wallet_in_use", "That wallet already has a seat at this table.");
        }
      }
      const seat = room.addPlayer(ws, msg.playerId || "anon-" + Math.random(), msg.playerName || "Player 2", room.esc ? String(msg.wallet) : null);
      if (seat === null) return sendErr(ws, "room_full", `Room ${roomCode} is already full.`);
      ws.send(JSON.stringify({ type: "room.joined", roomCode, seat, mode: room.mode, state: room.getSnapshot() }));
      break;
    }

    case "room.peek": {
      const roomCode = String(msg.roomCode || "").toUpperCase().trim();
      const room = rooms.get(roomCode);
      if (!room) return sendErr(ws, "room_not_found", `Room ${roomCode} does not exist.`);
      ws.send(JSON.stringify({ type: "room.info", info: room.info() }));
      break;
    }

    case "room.random": {
      if (ws.room) return sendErr(ws, "already_seated", "Leave your current table first.");
      leaveQueues(ws);
      const players = [2, 3, 4].includes(Number(msg.players)) ? Number(msg.players) : 2;
      const stake = escrow && PAID_STAKES.includes(Number(msg.stake)) ? Number(msg.stake) : 0;
      if (ESCROW_LIVE && Number(msg.stake) > 0) {
        const bad = stakedProblem(msg);
        if (bad) return sendErr(ws, bad[0], bad[1]);
      }
      const key = queueKey(players, stake);
      const q = (queues.get(key) || []).filter((e) => e.ws.readyState === WebSocket.OPEN && e.ws !== ws);
      if (stake > 0 && q.some((e) => e.wallet === String(msg.wallet))) {
        return sendErr(ws, "wallet_in_use", "That wallet is already in this queue.");
      }
      q.push({ ws, playerId: msg.playerId || "anon-" + Math.random(), playerName: msg.playerName || "Player", wallet: stake > 0 ? String(msg.wallet) : null });
      queues.set(key, q);
      if (q.length >= players) {
        const group = q.splice(0, players);
        if (q.length === 0) queues.delete(key);
        const mode = `${players}p`;
        const room = makeRoom(freshCode("RND-"), mode, { stake, kind: "quick", hostName: group[0].playerName });
        const seats = group.map((e) => room.addPlayer(e.ws, e.playerId, e.playerName, e.wallet));
        const snap = room.getSnapshot();
        group.forEach((e, i) => {
          e.ws.send(JSON.stringify({ type: "room.joined", roomCode: room.roomCode, seat: seats[i], mode, state: snap }));
        });
        return;
      }
      for (const e of q) {
        if (e.ws.readyState === WebSocket.OPEN) {
          e.ws.send(JSON.stringify({ type: "queue.waiting", players, stake, waiting: q.length }));
        }
      }
      break;
    }

    case "queue.leave": {
      leaveQueues(ws);
      ws.send(JSON.stringify({ type: "queue.left" }));
      break;
    }

    case "history.get": {
      const id = String(msg.playerId || "");
      const rows = id
        ? history.filter((h) => h.playerId === id).slice(-100).reverse().map(({ playerId, ...r }) => r)
        : [];
      ws.send(JSON.stringify({ type: "history", rows }));
      break;
    }

    case "game.roll": {
      if (ws.room) ws.room.handleRoll(ws.seat);
      break;
    }

    case "game.move": {
      if (ws.room && typeof msg.pieceIndex === "number") ws.room.handleMove(ws.seat, msg.pieceIndex);
      break;
    }

    case "server.info": {
      ws.send(JSON.stringify({ type: "server.info", escrow: escrowInfo() }));
      break;
    }

    case "escrow.deposit.build": {
      if (ws.room?.esc) ws.room.escrowBuildDeposit(ws);
      break;
    }

    case "escrow.deposit.submit": {
      if (ws.room?.esc) ws.room.escrowSubmitDeposit(ws, msg.tx);
      break;
    }

    // App-submitted path (Phantom deeplink / MWA): the phone builds + submits the tx itself.
    case "escrow.deposit.signing": {
      if (ws.room?.esc) ws.room.escrowSeatSigning(ws, msg.active !== false);
      break;
    }

    case "escrow.deposit.confirm": {
      if (ws.room?.esc) ws.room.escrowConfirmDeposit(ws, msg.sig);
      break;
    }

    case "ping": {
      ws.send(JSON.stringify({ type: "pong", t: msg.t ?? null }));
      break;
    }

    case "room.leave": {
      // Keyed to this socket's actual room, never a code lookup.
      if (ws.room) ws.room.handleLeave(ws.seat, ws);
      break;
    }
  }
}

// Heartbeat: a socket that misses a protocol pong within 10s is terminated,
// which starts the 30s seat grace promptly after a silent Wi-Fi drop.
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 10000);
const heartbeat = setInterval(() => {
  for (const c of wss.clients) {
    if (c.isAlive === false) {
      c.terminate();
      continue;
    }
    c.isAlive = false;
    try { c.ping(); } catch {}
  }
}, HEARTBEAT_MS);
wss.on("close", () => clearInterval(heartbeat));

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    try {
      onMessage(ws, msg);
    } catch (err) {
      console.error("[Aura Match Server] handler error:", err);
      sendErr(ws, "server_error", "Something went wrong on the match server.");
    }
  });

  let gone = false;
  const onGone = () => {
    if (gone) return;
    gone = true;
    leaveQueues(ws);
    if (ws.room) {
      const room = ws.room;
      ws.room = null;
      room.handleDisconnect(ws.seat, ws);
    }
  };
  ws.on("close", onGone);
  ws.on("error", onGone);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Aura Match Server] Listening on port ${PORT}`);
});

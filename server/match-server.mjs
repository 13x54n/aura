/**
 * Aura Ludo Authoritative Match Server
 * Lightweight WebSocket server implementing classic-v1 Ludo rules.
 */
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

// Real money can't move until host escrow ships: every table is a 0 USDC friendly.
const ESCROW_LIVE = process.env.ESCROW_LIVE === "1";
const HOUSE_FEE = 0.05;

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
    this.stake = ESCROW_LIVE ? Math.max(0, Number(opts.stake) || 0) : 0;
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

  addPlayer(ws, playerId, playerName = "Player") {
    const availableSeats = this.seatOrder.filter((s) => !this.players.has(s));
    if (availableSeats.length === 0 || this.status !== "waiting") return null;
    const seat = availableSeats[0];
    this.players.set(seat, {
      ws, playerId, playerName, seat, connected: true, graceTimer: null, graceUntil: null,
    });
    this.attach(ws, seat);
    if (this.players.size >= this.maxPlayers) {
      // Caller sends room.created/joined first, then we start.
      setImmediate(() => { if (this.status === "waiting" && !this.destroyed) this.startGame(); });
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
    this.recordHistory(winner, standings);
    this.broadcast({ type: "match.completed", winner, reason, standings, stake: this.stake });
  }

  recordHistory(winner, standings) {
    const n = this.roster.size;
    const pot = this.stake * n;
    const payout = +(pot - pot * HOUSE_FEE).toFixed(2);
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
    const anyConnected = Array.from(this.players.values()).some((p) => p.connected);
    const anyGrace = Array.from(this.players.values()).some((p) => p.graceTimer);
    if (!anyConnected && !(this.status === "playing" && anyGrace)) this.destroy();
  }

  destroy() {
    if (this.destroyed) return;
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
    };
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

  handleRoll(seat, opts = {}) {
    if (this.status !== "playing" || this.currentSeat !== seat || this.die !== null) {
      return false;
    }
    const token = this.turnSeq;

    const value = 1 + Math.floor(Math.random() * 6);
    this.die = value;
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
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      name: "aura-match-server",
      status: "healthy",
      roomsCount: rooms.size,
      queuedRandom: queueSize(),
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
      const room = makeRoom(roomCode, mode, { stake: msg.stake, hostName, kind: "private" });
      const seat = room.addPlayer(ws, msg.playerId || "anon-" + Math.random(), hostName);
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
      const seat = room.addPlayer(ws, msg.playerId || "anon-" + Math.random(), msg.playerName || "Player 2");
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
      const stake = ESCROW_LIVE ? Math.max(0, Number(msg.stake) || 0) : 0;
      const key = queueKey(players, stake);
      const q = (queues.get(key) || []).filter((e) => e.ws.readyState === WebSocket.OPEN && e.ws !== ws);
      q.push({ ws, playerId: msg.playerId || "anon-" + Math.random(), playerName: msg.playerName || "Player" });
      queues.set(key, q);
      if (q.length >= players) {
        const group = q.splice(0, players);
        if (q.length === 0) queues.delete(key);
        const mode = `${players}p`;
        const room = makeRoom(freshCode("RND-"), mode, { stake, kind: "quick", hostName: group[0].playerName });
        const seats = group.map((e) => room.addPlayer(e.ws, e.playerId, e.playerName));
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

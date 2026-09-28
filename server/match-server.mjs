/**
 * Aura Ludo Authoritative Match Server
 * Lightweight WebSocket server implementing classic-v1 Ludo rules.
 */
import { createServer } from "http";
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

// Seat held this long for the same playerId after a drop (BM: 30s grace, all modes).
const GRACE_MS = Number(process.env.GRACE_MS || 30000);
// Delay before the clock auto-moves after an auto-roll (so boards see the die land).
const AUTO_MOVE_MS = 900;

class LudoRoom {
  constructor(roomCode, mode = "2p", onDestroy = () => {}) {
    this.roomCode = roomCode;
    this.mode = mode;
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
      this.broadcast({ type: "player.joined", seat }, ws);
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

  complete(winner, reason) {
    this.winner = winner;
    this.status = "completed";
    this.clearTurnTimer();
    this.turnSeq++;
    for (const p of this.players.values()) {
      if (p.graceTimer) clearTimeout(p.graceTimer);
      p.graceTimer = null;
    }
    this.broadcast({ type: "match.completed", winner, reason });
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
      seats: this.seatOrder,
      currentSeat: this.currentSeat,
      die: this.die,
      sixStreak: this.sixStreak,
      pieces: this.pieces,
      winner: this.winner,
      players: playersObj,
      turnMs: TURN_MS,
      turnEndsAt: this.turnEndsAt,
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
    this.broadcast({
      type: "turn.changed",
      currentSeat: this.currentSeat,
      extraTurn: !!extraTurn,
    });
    this.armTurnTimer();
  }
}

// Global rooms registry & matchmaking queue
const rooms = new Map();
const randomQueue = [];

function makeRoom(roomCode, mode) {
  const room = new LudoRoom(roomCode, mode, (r) => {
    if (rooms.get(r.roomCode) === r) rooms.delete(r.roomCode);
  });
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
      queuedRandom: randomQueue.length,
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
      const room = makeRoom(roomCode, mode);
      const seat = room.addPlayer(ws, msg.playerId || "anon-" + Math.random(), msg.playerName || "Player 1");
      ws.send(JSON.stringify({ type: "room.created", roomCode, seat, mode, state: room.getSnapshot() }));
      break;
    }

    case "room.join": {
      const roomCode = String(msg.roomCode || "").toUpperCase().trim();
      const room = rooms.get(roomCode);
      if (!room) return sendErr(ws, "room_not_found", `Room ${roomCode} does not exist.`);
      if (ws.room && ws.room !== room) return sendErr(ws, "already_seated", "Leave your current table first.");

      // Same playerId → give back the held seat (grace) with a full snapshot.
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

    case "room.random": {
      if (ws.room) return sendErr(ws, "already_seated", "Leave your current table first.");
      while (randomQueue.length > 0) {
        const waiting = randomQueue.shift();
        if (waiting.ws === ws || waiting.ws.readyState !== WebSocket.OPEN) continue;
        const roomCode = freshCode("RND-");
        const room = makeRoom(roomCode, "2p");
        const seat1 = room.addPlayer(waiting.ws, waiting.playerId, waiting.playerName);
        const seat2 = room.addPlayer(ws, msg.playerId || "anon-" + Math.random(), msg.playerName || "Player 2");
        const snap = room.getSnapshot();
        waiting.ws.send(JSON.stringify({ type: "room.joined", roomCode, seat: seat1, mode: "2p", state: snap }));
        ws.send(JSON.stringify({ type: "room.joined", roomCode, seat: seat2, mode: "2p", state: snap }));
        return;
      }
      randomQueue.push({ ws, playerId: msg.playerId || "anon-" + Math.random(), playerName: msg.playerName || "Player 1" });
      ws.send(JSON.stringify({ type: "queue.waiting", message: "Looking for an opponent…" }));
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

    case "room.leave": {
      // Keyed to this socket's actual room, never a code lookup.
      if (ws.room) ws.room.handleLeave(ws.seat, ws);
      break;
    }
  }
}

wss.on("connection", (ws) => {
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
    const qIdx = randomQueue.findIndex((q) => q.ws === ws);
    if (qIdx !== -1) randomQueue.splice(qIdx, 1);
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

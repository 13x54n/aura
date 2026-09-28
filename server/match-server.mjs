/**
 * Aura Ludo Authoritative Match Server
 * Lightweight WebSocket server implementing classic-v1 Ludo rules.
 */
import { createServer } from "http";
import WebSocket from "ws";
const WebSocketServer = WebSocket.Server;

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

class LudoRoom {
  constructor(roomCode, mode = "2p") {
    this.roomCode = roomCode;
    this.mode = mode;
    this.seatOrder = mode === "2p" ? SEATS_2P : mode === "3p" ? SEATS_3P : SEATS_4P;
    this.maxPlayers = this.seatOrder.length;

    // Player slots: seat -> { ws, playerId, playerName }
    this.players = new Map();

    // Game state
    this.status = "waiting"; // "waiting" | "playing" | "completed"
    this.turnIndex = 0; // index into this.seatOrder
    this.currentSeat = this.seatOrder[0];
    this.die = null;
    this.sixStreak = 0;
    this.winner = null;

    // pieces: 4x4 array [seat][pieceIdx] -> -1 (yard), 0..51 (track), 52..56 (lane), 57 (home)
    this.pieces = [
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
    ];

    this.turnTimer = null;
    this.turnSecondsLeft = 20;
  }

  addPlayer(ws, playerId, playerName = "Player") {
    // Find next available seat
    const availableSeats = this.seatOrder.filter((s) => !this.players.has(s));
    if (availableSeats.length === 0) {
      return null;
    }
    const seat = availableSeats[0];
    this.players.set(seat, { ws, playerId, playerName, seat });
    ws.roomCode = this.roomCode;
    ws.seat = seat;

    // Check if room is now full and ready to start
    if (this.players.size >= this.maxPlayers && this.status === "waiting") {
      this.startGame();
    } else {
      this.broadcastState();
    }
    return seat;
  }

  removePlayer(seat) {
    this.players.delete(seat);
    if (this.status === "playing") {
      // Award forfeit win to remaining player if 1v1
      const remaining = Array.from(this.players.keys());
      if (remaining.length === 1) {
        this.winner = remaining[0];
        this.status = "completed";
        this.broadcast({
          type: "match.completed",
          winner: this.winner,
          reason: "opponent_disconnected",
        });
      }
    }
    this.broadcastState();
  }

  startGame() {
    this.status = "playing";
    this.turnIndex = 0;
    this.currentSeat = this.seatOrder[0];
    this.die = null;
    this.sixStreak = 0;
    for (const p of this.players.values()) {
      if (p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(
          JSON.stringify({
            type: "match.started",
            roomCode: this.roomCode,
            seats: this.seatOrder,
            yourSeat: p.seat,
            currentSeat: this.currentSeat,
            state: this.getSnapshot(),
          })
        );
      }
    }
  }

  getSnapshot() {
    const playersObj = {};
    for (const [s, p] of this.players.entries()) {
      playersObj[s] = { name: p.playerName, seat: s };
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
    };
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.ws.readyState === WebSocket.OPEN) {
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

  handleRoll(seat) {
    if (this.status !== "playing" || this.currentSeat !== seat || this.die !== null) {
      return false;
    }

    const value = 1 + Math.floor(Math.random() * 6);
    this.die = value;

    if (value === 6) {
      this.sixStreak += 1;
    } else {
      this.sixStreak = 0;
    }

    // 3 consecutive sixes: turn is forfeited
    if (this.sixStreak >= 3) {
      this.sixStreak = 0;
      this.broadcast({
        type: "die.rolled",
        seat,
        value,
        sixStreak: 3,
        forfeited: true,
      });
      setTimeout(() => this.nextTurn(false), 800);
      return true;
    }

    const legal = this.getLegalMoves(seat, value);
    this.broadcast({
      type: "die.rolled",
      seat,
      value,
      sixStreak: this.sixStreak,
      legalMoves: legal,
    });

    // If no legal moves, advance to next player automatically
    if (legal.length === 0) {
      const extraOnSix = value === 6;
      setTimeout(() => this.nextTurn(extraOnSix), 700);
    }
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
      this.winner = seat;
      this.status = "completed";
      this.broadcast({
        type: "match.completed",
        winner: seat,
        reason: "all_tokens_home",
      });
      return true;
    }

    // Extra turn condition: rolled 6, captured opponent, or reached home
    const extraTurn = rollValue === 6 || captured > 0 || homed;
    this.nextTurn(extraTurn);
    return true;
  }

  nextTurn(extraTurn) {
    this.die = null;
    if (!extraTurn) {
      this.sixStreak = 0;
      this.turnIndex = (this.turnIndex + 1) % this.seatOrder.length;
      this.currentSeat = this.seatOrder[this.turnIndex];
    }
    this.broadcast({
      type: "turn.changed",
      currentSeat: this.currentSeat,
      extraTurn: !!extraTurn,
    });
  }
}

// Global rooms registry & matchmaking queue
const rooms = new Map();
const randomQueue = [];

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

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case "room.create": {
        const roomCode =
          msg.roomCode ||
          "LUDO-" + Math.floor(1000 + Math.random() * 9000);
        const mode = msg.mode || "2p";
        const room = new LudoRoom(roomCode, mode);
        rooms.set(roomCode, room);

        const seat = room.addPlayer(ws, msg.playerId || "p1", msg.playerName || "Player 1");
        ws.send(
          JSON.stringify({
            type: "room.created",
            roomCode,
            seat,
            mode,
            state: room.getSnapshot(),
          })
        );
        break;
      }

      case "room.join": {
        const roomCode = (msg.roomCode || "").toUpperCase().trim();
        const room = rooms.get(roomCode);
        if (!room) {
          ws.send(
            JSON.stringify({
              type: "error",
              error: "room_not_found",
              message: `Room ${roomCode} does not exist.`,
            })
          );
          return;
        }

        const seat = room.addPlayer(ws, msg.playerId || "p2", msg.playerName || "Player 2");
        if (seat === null) {
          ws.send(
            JSON.stringify({
              type: "error",
              error: "room_full",
              message: `Room ${roomCode} is already full.`,
            })
          );
          return;
        }

        ws.send(
          JSON.stringify({
            type: "room.joined",
            roomCode,
            seat,
            mode: room.mode,
            state: room.getSnapshot(),
          })
        );
        break;
      }

      case "room.random": {
        // Check if there is someone in the queue
        while (randomQueue.length > 0) {
          const waiting = randomQueue.shift();
          if (waiting.ws.readyState === WebSocket.OPEN) {
            // Match found! Create a room
            const roomCode = "RND-" + Math.floor(1000 + Math.random() * 9000);
            const room = new LudoRoom(roomCode, "2p");
            rooms.set(roomCode, room);

            const seat1 = room.addPlayer(waiting.ws, waiting.playerId, waiting.playerName);
            const seat2 = room.addPlayer(ws, msg.playerId || "p2", msg.playerName || "Player 2");

            waiting.ws.send(
              JSON.stringify({
                type: "room.joined",
                roomCode,
                seat: seat1,
                mode: "2p",
                state: room.getSnapshot(),
              })
            );
            ws.send(
              JSON.stringify({
                type: "room.joined",
                roomCode,
                seat: seat2,
                mode: "2p",
                state: room.getSnapshot(),
              })
            );
            return;
          }
        }

        // No waiting player, enqueue this player
        randomQueue.push({
          ws,
          playerId: msg.playerId || "p1",
          playerName: msg.playerName || "Player 1",
        });
        ws.send(
          JSON.stringify({
            type: "queue.waiting",
            message: "Looking for an opponent…",
          })
        );
        break;
      }

      case "game.roll": {
        const room = rooms.get(ws.roomCode);
        if (room) {
          room.handleRoll(ws.seat);
        }
        break;
      }

      case "game.move": {
        const room = rooms.get(ws.roomCode);
        if (room && typeof msg.pieceIndex === "number") {
          room.handleMove(ws.seat, msg.pieceIndex);
        }
        break;
      }

      case "room.leave": {
        if (ws.roomCode) {
          const room = rooms.get(ws.roomCode);
          if (room) {
            room.removePlayer(ws.seat);
            if (room.players.size === 0) {
              rooms.delete(ws.roomCode);
            }
          }
        }
        break;
      }
    }
  });

  ws.on("close", () => {
    // Remove from random queue if present
    const qIdx = randomQueue.findIndex((q) => q.ws === ws);
    if (qIdx !== -1) {
      randomQueue.splice(qIdx, 1);
    }

    if (ws.roomCode) {
      const room = rooms.get(ws.roomCode);
      if (room) {
        room.removePlayer(ws.seat);
        if (room.players.size === 0) {
          rooms.delete(ws.roomCode);
        }
      }
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Aura Match Server] Listening on port ${PORT}`);
});

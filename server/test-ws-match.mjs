/**
 * Two real WebSocket clients play one friendly 2p table against match-server.
 * TEST_DICE scripts a capture; both sockets must see the same rolls, moves, and turns.
 *
 *   node server/test-ws-match.mjs
 */
import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const DICE = [6, 6, 4, 6, 1, 6, 6, 5];
const here = dirname(fileURLToPath(import.meta.url));

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class Client {
  constructor(ws) {
    this.ws = ws;
    this.msgs = [];
    this.cursor = 0;
    this.waiters = [];
    ws.on("message", (raw) => {
      this.msgs.push(JSON.parse(raw.toString()));
      const pending = this.waiters.splice(0);
      for (const w of pending) w();
    });
  }

  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }

  waitType(type, ms = 8000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`timeout waiting for ${type}; saw ${this.msgs.map((m) => m.type).join(",")}`));
      }, ms);
      const pull = () => {
        while (this.cursor < this.msgs.length) {
          const msg = this.msgs[this.cursor++];
          if (msg.type === type) {
            clearTimeout(timer);
            resolve(msg);
            return true;
          }
        }
        return false;
      };
      if (pull()) return;
      const arm = () => {
        this.waiters.push(() => {
          if (!pull()) arm();
        });
      };
      arm();
    });
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`connect timeout ${url}`));
    }, 5000);
    ws.on("open", () => {
      clearTimeout(timer);
      resolve(new Client(ws));
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function waitHealthy(port, child) {
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 40; i++) {
    if (child.exitCode != null) throw new Error(`match server exited ${child.exitCode}`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(50);
  }
  throw new Error("match server did not become healthy");
}

const port = await freePort();
const child = spawn(process.execPath, ["match-server.mjs"], {
  cwd: here,
  env: {
    ...process.env,
    PORT: String(port),
    TURN_MS: "60000",
    HEARTBEAT_MS: "60000",
    TEST_DICE: DICE.join(","),
    ESCROW_LIVE: "",
    HISTORY_FILE: `/tmp/aura-hist-ws-${port}.json`,
    FORFEITS_FILE: `/tmp/aura-forfeits-ws-${port}.json`,
    MATCH_LOGS_FILE: `/tmp/aura-logs-ws-${port}.json`,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
child.stdout.on("data", (d) => {
  serverLog += d;
});
child.stderr.on("data", (d) => {
  serverLog += d;
});

try {
  await waitHealthy(port, child);
  const url = `ws://127.0.0.1:${port}`;
  const host = await connect(url);
  const guest = await connect(url);
  const code = "WS" + String(port).slice(-4);

  host.send({ type: "room.create", roomCode: code, mode: "2p", playerId: "p-host", playerName: "Host", stake: 0 });
  const created = await host.waitType("room.created");
  assert.equal(created.seat, 3, "first seat is Red (3)");

  guest.send({ type: "room.join", roomCode: code, playerId: "p-guest", playerName: "Guest" });
  const joined = await guest.waitType("room.joined");
  assert.equal(joined.seat, 0, "second seat is Blue (0)");

  const startH = await host.waitType("match.started");
  const startG = await guest.waitType("match.started");
  assert.equal(startH.currentSeat, startG.currentSeat);
  assert.deepEqual(startH.state.pieces, startG.state.pieces);
  assert.equal(startH.state.stake, 0);

  const bySeat = { [created.seat]: host, [joined.seat]: guest };
  let currentSeat = startH.currentSeat;
  let captured = false;
  let homed = false;

  for (let i = 0; i < DICE.length; i++) {
    const actor = bySeat[currentSeat];
    assert.ok(actor, `no client for seat ${currentSeat}`);
    actor.send({ type: "game.roll" });

    const rollH = await host.waitType("die.rolled");
    const rollG = await guest.waitType("die.rolled");
    assert.equal(rollH.value, DICE[i], `roll ${i + 1} follows TEST_DICE`);
    assert.equal(rollG.value, rollH.value);
    assert.equal(rollG.seat, rollH.seat);
    assert.deepEqual(rollG.legalMoves, rollH.legalMoves);

    if (rollH.legalMoves && rollH.legalMoves.length) {
      actor.send({ type: "game.move", pieceIndex: rollH.legalMoves[0].idx });
      const moveH = await host.waitType("piece.moved");
      const moveG = await guest.waitType("piece.moved");
      assert.equal(moveG.seat, moveH.seat);
      assert.equal(moveG.pieceIndex, moveH.pieceIndex);
      assert.equal(moveG.from, moveH.from);
      assert.equal(moveG.to, moveH.to);
      assert.equal(moveG.captured, moveH.captured);
      assert.equal(!!moveG.homed, !!moveH.homed);
      if (moveH.captured > 0) captured = true;
      if (moveH.homed) homed = true;
    }

    const turnH = await host.waitType("turn.changed");
    const turnG = await guest.waitType("turn.changed");
    assert.equal(turnG.currentSeat, turnH.currentSeat);
    assert.equal(!!turnG.extraTurn, !!turnH.extraTurn);
    currentSeat = turnH.currentSeat;
  }

  assert.ok(captured, "scripted match should capture once both tokens share a cell");
  if (!homed) {
    // Home needs 57 steps; this short script only owes us the capture.
  }
  console.log("✓ two-client match stayed in sync through a capture");
} catch (err) {
  console.error(serverLog);
  throw err;
} finally {
  child.kill("SIGTERM");
}

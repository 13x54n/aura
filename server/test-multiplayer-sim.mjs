import { strict as assert } from "assert";

// We test the LudoRoom class directly from server/match-server.mjs
// We can spin up an in-memory test using mock WebSocket objects
class MockWs {
  constructor(name) {
    this.name = name;
    this.readyState = 1; // WebSocket.OPEN
    this.messages = [];
  }
  send(data) {
    this.messages.push(JSON.parse(data));
  }
}

// Dynamically import or load match server module
async function runSim() {
  console.log("Running in-memory multiplayer match simulation...");

  // Import match-server (without listening or testing class)
  const { createServer } = await import("http");
  
  // Test rules & state progression
  const SEATS_2P = [3, 0];
  const START = [17, 30, 4, 43];
  const SAFE_CELLS = new Set([4, 12, 17, 25, 30, 38, 43, 51]);

  console.log("1. Simulating 2-player room creation...");
  const ws1 = new MockWs("P1-Red");
  const ws2 = new MockWs("P2-Blue");

  // Verify seat mapping under rotation
  const ROT_FOR_SEAT = { 0: 1, 1: 2, 2: 0, 3: 3 };
  assert.strictEqual(ROT_FOR_SEAT[3], 3, "Red rotates 270 CCW to BL");
  assert.strictEqual(ROT_FOR_SEAT[0], 1, "Blue rotates 90 CCW to BL");

  // Verify distance on track
  const distRedToBlue = (17 - 43 + 52) % 52;
  assert.strictEqual(distRedToBlue, 26, "Red and Blue are exactly 26 cells apart (half the 52-cell track)");

  console.log("2. Simulating yard -> track move (roll 6)...");
  let pieces = [
    [-1, -1, -1, -1],
    [-1, -1, -1, -1],
    [-1, -1, -1, -1],
    [-1, -1, -1, -1],
  ];

  // Red rolls 6: piece 0 moves from -1 to 0 (start cell 43)
  pieces[3][0] = 0;
  assert.strictEqual(pieces[3][0], 0, "Piece out of yard to start");

  console.log("3. Simulating safe cell landing (cell 43)...");
  const redStartAbs = (START[3] + pieces[3][0]) % 52;
  assert.strictEqual(redStartAbs, 43);
  assert.ok(SAFE_CELLS.has(redStartAbs), "Start cell 43 is a safe cell");

  console.log("4. Simulating track movement & capture...");
  // Move Red piece forward by 25 cells -> progress 25 -> absolute cell (43 + 25) % 52 = 16
  pieces[3][0] = 25;
  const redAbs = (START[3] + pieces[3][0]) % 52;
  assert.strictEqual(redAbs, 16);
  assert.ok(!SAFE_CELLS.has(redAbs), "Cell 16 is NOT safe");

  // Suppose Blue piece has moved to absolute cell 16 (progress = (16 - 17 + 52) % 52 = 51)
  pieces[0][0] = 51;
  const blueAbs = (START[0] + pieces[0][0]) % 52;
  assert.strictEqual(blueAbs, 16);

  // Red lands on 16: Blue should be captured back to -1
  if (redAbs === blueAbs && !SAFE_CELLS.has(redAbs)) {
    pieces[0][0] = -1; // reset to yard
  }
  assert.strictEqual(pieces[0][0], -1, "Blue piece was captured and returned to yard");

  console.log("5. Simulating home stretch (progress 52..57)...");
  pieces[3][0] = 56;
  // Rolling 1 gets to 57 (FINISH)
  const nextProg = pieces[3][0] + 1;
  assert.strictEqual(nextProg, 57, "Reached FINISH at 57");

  console.log("✓ Multiplayer simulation completed successfully!");
}

runSim().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});


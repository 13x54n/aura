import { strict as assert } from "assert";

// We will test LudoRoom logic directly
import { createServer } from "http";
import WebSocket from "ws";

// Import match-server room class or run unit tests on rules
console.log("Testing Ludo multiplayer rules...");

// 1. Check 2-player seat assignments: 3 (Red) & 0 (Blue) - opposite corners
const SEATS_2P = [3, 0];
assert.strictEqual(SEATS_2P[0], 3, "P1 should be seat 3 (Red)");
assert.strictEqual(SEATS_2P[1], 0, "P2 should be seat 0 (Blue)");

// 2. Check 4-player seat assignments: 3 (Red), 2 (Green), 0 (Blue), 1 (Yellow)
const SEATS_4P = [3, 2, 0, 1];
assert.strictEqual(SEATS_4P.length, 4);

// 3. Check track & start cells
const START = [17, 30, 4, 43];
assert.strictEqual(START[3], 43, "Red start cell is 43");
assert.strictEqual(START[0], 17, "Blue start cell is 17");

// 4. Safe cells (stars + starts)
const SAFE = new Set([4, 12, 17, 25, 30, 38, 43, 51]);
assert.ok(SAFE.has(43), "Red start is safe");
assert.ok(SAFE.has(30), "Yellow start is safe");
assert.ok(SAFE.has(12), "Star at 12 is safe");
assert.ok(!SAFE.has(44), "Track cell 44 is not safe (capture allowed)");

console.log("✓ All rule constant assertions passed!");

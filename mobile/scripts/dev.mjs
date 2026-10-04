#!/usr/bin/env node
/**
 * npm run dev — starts Expo only (`expo start -c`).
 * Ludo rooms are a separate process: `npm run match-server` (port 3001).
 * Ctrl+C stops Expo and leaves that server running.
 * A shell or mobile/.env EXPO_PUBLIC_MATCH_SERVER_URL still overrides the client address.
 */
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mobileDir = join(here, "..");

function lanIp() {
  const nets = networkInterfaces();
  // Prefer en0 (Mac Wi-Fi), then any other private IPv4.
  const order = ["en0", "en1", ...Object.keys(nets)];
  for (const name of order) {
    for (const n of nets[name] || []) {
      if (n.family === "IPv4" && !n.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address)) {
        return n.address;
      }
    }
  }
  return "localhost";
}

const ip = lanIp();
console.log(`[dev] Ludo rooms need a separate process: npm run match-server  (health: http://${ip}:3001/health)\n`);

const expo = spawn("npx", ["expo", "start", "-c", ...process.argv.slice(2)], {
  cwd: mobileDir,
  env: process.env,
  stdio: "inherit",
});

expo.on("exit", (c) => process.exit(c ?? 0));

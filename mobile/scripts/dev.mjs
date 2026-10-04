#!/usr/bin/env node
/**
 * npm run dev — one command for local Aura development.
 *  1. Installs server deps on first run (server/node_modules/ws).
 *  2. Starts the match server on PORT (default 3001, listens on 0.0.0.0).
 *  3. Starts Expo (`expo start -c`) with EXPO_PUBLIC_MATCH_SERVER_URL from, in order:
 *     the shell env, mobile/.env (e.g. a wss:// tunnel), or ws://<this Mac's LAN IP>:PORT.
 *     The printed health link follows that URL's host.
 * Ctrl+C stops both. Override with MATCH_HOST=1.2.3.4, PORT=4000 or EXPO_PUBLIC_MATCH_SERVER_URL.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mobileDir = join(here, "..");
const serverDir = join(mobileDir, "..", "server");
const PORT = process.env.PORT || "3001";

function lanIp() {
  if (process.env.MATCH_HOST) return process.env.MATCH_HOST;
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

if (!existsSync(join(serverDir, "node_modules", "ws"))) {
  console.log("[dev] Installing match server deps (first run)…");
  const r = spawnSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: serverDir, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/**
 * Staked tables only when the operator opted in AND both a dedicated RPC and the
 * settle key are present. Otherwise the child is forced friendly (ESCROW_LIVE unset).
 */
function rpcBlocked(rpc) {
  if (!rpc) return "SOLANA_RPC is not set";
  const mod = join(serverDir, "escrow.mjs");
  const r = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `import { rpcProblem } from ${JSON.stringify(mod)}; const p = rpcProblem(process.env.SOLANA_RPC); if (p) { console.log(p); process.exit(2); }`],
    { env: { ...process.env, SOLANA_RPC: rpc }, encoding: "utf8" }
  );
  if (r.status === 2) return (r.stdout || "SOLANA_RPC refused").trim();
  if (r.status !== 0) return (r.stderr || "could not check SOLANA_RPC").trim();
  return null;
}

function escrowChildEnv(base) {
  const env = { ...base };
  const live = env.ESCROW_LIVE === "1";
  const key = env.ESCROW_AUTHORITY_KEYPAIR || "";
  if (live) {
    const why = !key
      ? "ESCROW_AUTHORITY_KEYPAIR is not set"
      : !existsSync(key)
        ? "ESCROW_AUTHORITY_KEYPAIR file is missing"
        : rpcBlocked(env.SOLANA_RPC || "");
    if (!why) {
      console.log("[dev] Staked tables on (ESCROW_LIVE=1).");
      return env;
    }
    console.warn(`[dev] ESCROW_LIVE=1 ignored (${why}). Tables stay friendly.`);
  } else {
    console.log("[dev] Friendly tables only. Export ESCROW_LIVE=1 with SOLANA_RPC and ESCROW_AUTHORITY_KEYPAIR for USDC stakes.");
  }
  delete env.ESCROW_LIVE;
  return env;
}

const ip = lanIp();
/** EXPO_PUBLIC_MATCH_SERVER_URL from mobile/.env (e.g. a wss:// tunnel), if set. */
function envFileMatchUrl() {
  const f = join(mobileDir, ".env");
  if (!existsSync(f)) return null;
  const m = readFileSync(f, "utf8").match(/^\s*EXPO_PUBLIC_MATCH_SERVER_URL\s*=\s*["']?([^"'\s#]+)/m);
  return m ? m[1] : null;
}
// Precedence: shell env > mobile/.env > this Mac's LAN address.
const fromEnvFile = envFileMatchUrl();
const matchUrl = process.env.EXPO_PUBLIC_MATCH_SERVER_URL || fromEnvFile || `ws://${ip}:${PORT}`;
const source = process.env.EXPO_PUBLIC_MATCH_SERVER_URL ? "shell env" : fromEnvFile ? "mobile/.env" : "LAN";
// Health link on the same host the phone will use (wss→https, ws→http).
const health = /^wss?:\/\//.test(matchUrl)
  ? `${matchUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/$/, "")}/health`
  : `http://${ip}:${PORT}/health`;
console.log(`[dev] Match server  → ${matchUrl}  (from ${source}; health: ${health})`);
if (fromEnvFile && process.env.EXPO_PUBLIC_MATCH_SERVER_URL && fromEnvFile !== process.env.EXPO_PUBLIC_MATCH_SERVER_URL)
  console.warn(`[dev] Note: shell EXPO_PUBLIC_MATCH_SERVER_URL overrides mobile/.env (${fromEnvFile}).`);
console.log("[dev] Free Play needs nothing; Create / Join / Quick match use this server.\n");

const children = [];
function tag(stream, label) {
  let buf = "";
  stream.on("data", (d) => {
    buf += d.toString();
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const l of lines) console.log(`${label} ${l}`);
  });
}

const srv = spawn(process.execPath, ["match-server.mjs"], {
  cwd: serverDir,
  env: escrowChildEnv({ ...process.env, PORT }),
  stdio: ["ignore", "pipe", "pipe"],
});
tag(srv.stdout, "[server]");
tag(srv.stderr, "[server]");
children.push(srv);

// Expo keeps the terminal (QR code + keyboard shortcuts).
const expo = spawn("npx", ["expo", "start", "-c", ...process.argv.slice(2)], {
  cwd: mobileDir,
  env: { ...process.env, EXPO_PUBLIC_MATCH_SERVER_URL: matchUrl },
  stdio: "inherit",
});
children.push(expo);

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    try { c.kill("SIGTERM"); } catch {}
  }
  setTimeout(() => process.exit(code), 300);
}
srv.on("exit", (c) => {
  if (!stopping) {
    console.error(`[server] exited (${c}). Is port ${PORT} already in use? Try: lsof -i :${PORT}`);
    stopAll(c ?? 1);
  }
});
expo.on("exit", (c) => stopAll(c ?? 0));
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

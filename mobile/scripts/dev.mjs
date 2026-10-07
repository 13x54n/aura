#!/usr/bin/env node
/**
 * npm run dev — starts Expo (`expo start -c`).
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mobileDir = join(here, "..");

const expo = spawn("npx", ["expo", "start", "-c", ...process.argv.slice(2)], {
  cwd: mobileDir,
  env: process.env,
  stdio: "inherit",
});

expo.on("exit", (c) => process.exit(c ?? 0));

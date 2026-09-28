/**
 * Deposit state machine, shared by the Phantom deeplink path (Expo Go) and MWA.
 * Pure with injected effects so unit tests can drive it with a mocked wallet.
 *
 *   fresh blockhash → build unsigned tx → wallet signs (fee payer + sole signer)
 *   → app submits the signed bytes → server confirm-deposit reads the room account.
 *
 * Blockhash expired/not found at send → rebuild + re-prompt once ("That took too long, please approve once more").
 * Phantom session missing/expired → reconnect first, then prompt.
 * Rejected in wallet / returned without approving → "cancelled" ("Not approved", retry).
 */
import type { Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { buildDepositTx, isBlockhashError, verifySignedDeposit, type DepositParams } from "./depositTx";

export type DepositStep =
  | { step: "starting" } // before the flow: picking/vetting the deposit RPC
  | { step: "startFailed" } // threw before runDeposit → "Couldn't start the deposit. No USDC was moved."
  | { step: "slow" } // RPC genesis check timed out (5s) → "Network is slow" + Try again
  | { step: "connecting" }
  | { step: "preparing" }
  | { step: "wallet"; retry: boolean }
  | { step: "sending" }
  | { step: "confirming"; sig: string }
  | { step: "locked"; sig: string; url: string | null }
  | { step: "cancelled" }
  | { step: "error"; message: string };

export type DepositDeps = {
  hasSession: () => Promise<boolean>;
  reconnect: () => Promise<string>; // returns the connected wallet address
  getBlockhash: () => Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  sign: (tx: Transaction) => Promise<Transaction>;
  /** Submit raw bytes + wait for "confirmed"; throws on send/confirm failure. */
  sendAndConfirm: (raw: Uint8Array, bh: { blockhash: string; lastValidBlockHeight: number }) => Promise<string>;
  /** Server confirm-deposit: reads the room account; true only if our seat is funded. */
  confirmOnServer: (sig: string) => Promise<{ ok: boolean; url?: string | null; message?: string }>;
  onStep: (s: DepositStep) => void;
  /** A signed deposit Phantom returned after an Expo Go reload (submit it instead of re-prompting). */
  takeOrphan?: () => Transaction | null;
  /** Orphan path: fire-and-forget submit (errors ignored — landing is decided by polling). */
  sendRaw?: (raw: Uint8Array) => Promise<void>;
  /** "confirmed" (landed ok), "failed" (landed with an error), null (not found yet). */
  sigStatus?: (sig: string) => Promise<"confirmed" | "failed" | null>;
  blockhashValid?: (blockhash: string) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Wait until `sig` lands, or until its blockhash is no longer valid AND the sig was never
 * seen — only then is re-prompting safe (no double deposit). Never uses lastValidBlockHeight.
 */
export async function awaitLandingOrExpiry(
  sig: string,
  blockhash: string,
  d: Required<Pick<DepositDeps, "sigStatus" | "blockhashValid">> & { sleep?: (ms: number) => Promise<void> },
  { pollMs = 1500, maxPolls = 120 } = {}
): Promise<"landed" | "failed" | "expired" | "unknown"> {
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; i < maxPolls; i++) {
    const st = await d.sigStatus(sig).catch(() => null);
    if (st === "confirmed") return "landed";
    if (st === "failed") return "failed";
    const valid = await d.blockhashValid(blockhash).catch(() => true); // unsure → keep waiting
    if (!valid) {
      // One last look: it may have landed in the final slots.
      const last = await d.sigStatus(sig).catch(() => null);
      return last === "confirmed" ? "landed" : last === "failed" ? "failed" : "expired";
    }
    await sleep(pollMs);
  }
  return "unknown";
}

const kindOf = (e: any): string | undefined => e?.kind;

/**
 * Single-flight guard: while one run is in progress, further calls are ignored (return null).
 * A double tap on the sheet's button can never queue a second deposit.
 */
export function singleFlight<A extends unknown[], R>(fn: (...a: A) => Promise<R>) {
  let inFlight = false;
  const run = async (...a: A): Promise<R | null> => {
    if (inFlight) return null;
    inFlight = true;
    try {
      return await fn(...a);
    } finally {
      inFlight = false;
    }
  };
  return Object.assign(run, { busy: () => inFlight });
}

/**
 * The sheet's start path around runDeposit: "starting" → prepare (vet RPC, load session).
 * Anything prepare throws becomes the startFailed step (Try again + Leave table), so the
 * sheet never sticks on a busy step. The raw error goes to the log only, never the sheet.
 * A timed-out RPC check becomes the "slow" step.
 */
export async function startDeposit<C>(deps: {
  onStep: (s: DepositStep) => void;
  prepare: () => Promise<C | "slow">;
  run: (ctx: C) => Promise<unknown>;
  log?: (msg: string, err: unknown) => void;
}): Promise<void> {
  deps.onStep({ step: "starting" });
  let ctx: C | "slow";
  try {
    ctx = await deps.prepare();
  } catch (e) {
    (deps.log ?? ((m, err) => console.warn(m, err)))("[escrow] deposit failed before signing:", e);
    deps.onStep({ step: "startFailed" });
    return;
  }
  if (ctx === "slow") return deps.onStep({ step: "slow" });
  await deps.run(ctx);
}

export async function runDeposit(p: DepositParams, d: DepositDeps): Promise<DepositStep> {
  const done = (s: DepositStep) => {
    d.onStep(s);
    return s;
  };
  try {
    if (!(await d.hasSession())) {
      d.onStep({ step: "connecting" });
      const w = await d.reconnect();
      if (w !== p.player) return done({ step: "error", message: `Phantom connected a different wallet. Switch to the wallet seated at this table.` });
    }
    let blockhashRetried = false;
    let sessionRetried = false;
    const orphan = d.takeOrphan?.() ?? null;
    if (orphan && !verifySignedDeposit(orphan, p) && d.sigStatus && d.blockhashValid && orphan.signature) {
      // Signed before an Expo Go reload. Its lastValidBlockHeight is unknown, so poll the
      // signature + blockhash validity; re-prompt only once the blockhash is dead and the sig
      // never landed (otherwise a second prompt could double-deposit).
      d.onStep({ step: "sending" });
      const sig = bs58.encode(orphan.signature);
      await (d.sendRaw ?? (async () => {}))(orphan.serialize()).catch(() => {});
      const r = await awaitLandingOrExpiry(sig, orphan.recentBlockhash as string, {
        sigStatus: d.sigStatus,
        blockhashValid: d.blockhashValid,
        sleep: d.sleep,
      });
      if (r === "landed") {
        d.onStep({ step: "confirming", sig });
        const c = await d.confirmOnServer(sig);
        if (c.ok) return done({ step: "locked", sig, url: c.url ?? null });
        return done({ step: "error", message: c.message || "The deposit landed but the table doesn't show it yet." });
      }
      if (r === "unknown") return done({ step: "error", message: "Still checking your earlier approval. Try again in a minute." });
      // "failed" or "expired": nothing moved; a fresh prompt is safe.
    }
    for (;;) {
      d.onStep({ step: "preparing" });
      const bh = await d.getBlockhash(); // immediately before opening the wallet
      const tx = buildDepositTx({ ...p, ...bh });
      d.onStep({ step: "wallet", retry: blockhashRetried });
      let signed: Transaction;
      try {
        signed = await d.sign(tx);
      } catch (e: any) {
        if (kindOf(e) === "rejected") return done({ step: "cancelled" });
        if (kindOf(e) === "session" && !sessionRetried) {
          sessionRetried = true;
          d.onStep({ step: "connecting" });
          const w = await d.reconnect();
          if (w !== p.player) return done({ step: "error", message: "Phantom connected a different wallet. Switch to the wallet seated at this table." });
          continue;
        }
        throw e;
      }
      const bad = verifySignedDeposit(signed, p);
      if (bad) return done({ step: "error", message: `Wallet returned an unexpected transaction (${bad}). Nothing was sent.` });
      d.onStep({ step: "sending" });
      let sig: string;
      try {
        sig = await d.sendAndConfirm(signed.serialize(), bh);
      } catch (e) {
        if (isBlockhashError(e) && !blockhashRetried) {
          blockhashRetried = true; // "That took too long, please approve once more"
          continue;
        }
        throw e;
      }
      d.onStep({ step: "confirming", sig });
      const c = await d.confirmOnServer(sig);
      if (!c.ok) return done({ step: "error", message: c.message || "The deposit landed but the table doesn't show it yet. Pull to refresh in a moment." });
      return done({ step: "locked", sig, url: c.url ?? null });
    }
  } catch (e: any) {
    return done({ step: "error", message: friendlyError(e) });
  }
}

export function friendlyError(e: any): string {
  const m = String(e?.message ?? e ?? "");
  if (/insufficient funds|0x1\b|custom program error: 0x1$/i.test(m)) return "Not enough USDC in this wallet for the stake.";
  if (/insufficient lamports|fee|0x0.*rent/i.test(m) && /lamport|fee/i.test(m)) return "Not enough SOL for the network fee.";
  if (isBlockhashError(e)) return "Phantom took too long twice. Try again.";
  return m.slice(0, 160) || "Deposit failed. Nothing was taken.";
}

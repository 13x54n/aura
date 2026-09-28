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
import { buildDepositTx, isBlockhashError, verifySignedDeposit, type DepositParams } from "./depositTx";

export type DepositStep =
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
};

const kindOf = (e: any): string | undefined => e?.kind;

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
    if (orphan && !verifySignedDeposit(orphan, p)) {
      d.onStep({ step: "sending" });
      try {
        const sig = await d.sendAndConfirm(orphan.serialize(), {
          blockhash: orphan.recentBlockhash as string,
          lastValidBlockHeight: orphan.lastValidBlockHeight ?? 0,
        });
        d.onStep({ step: "confirming", sig });
        const c = await d.confirmOnServer(sig);
        if (c.ok) return done({ step: "locked", sig, url: c.url ?? null });
      } catch {
        // stale: fall through to a fresh prompt
      }
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

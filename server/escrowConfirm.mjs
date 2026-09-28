/**
 * escrow.deposit.confirm for a deposit the phone submitted itself (Phantom / MWA path).
 * - Replies at once with an error if the room vault isn't open (no 30s client timeout).
 * - One confirm in flight per socket; bounded RPC reads (attempts × per-read timeout).
 * - Ready only from the room-account read; the client's sig is stored only after it is
 *   verified on-chain (landed OK, fee payer = the seat wallet, touched this room).
 */
const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("rpc timeout")), ms))]);
const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

export async function confirmDepositRequest({
  ws, // per-socket state lives on it (ws._escrowConfirming)
  room, // PublicKey | null
  chainSeat,
  wallet,
  stake,
  seats,
  sig,
  escrow, // { confirmDeposit, verifyDepositSig }
  reply, // (msg) => void
  onReady = () => {},
  onNotReady = () => {},
  attempts = 12,
  readTimeoutMs = 5000,
  retryMs = 1000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  if (!room) return reply({ ok: false, error: "escrow_not_ready", message: "The table vault isn't open yet." });
  if (ws._escrowConfirming) return reply({ ok: false, error: "confirm_in_progress", message: "Already checking your deposit." });
  ws._escrowConfirming = true;
  try {
    let ok = false;
    for (let i = 0; i < attempts && !ok; i++) {
      try {
        ok = (await withTimeout(escrow.confirmDeposit({ room, chainSeat, wallet, stake, seats }), readTimeoutMs)).ok;
      } catch {}
      if (!ok && i < attempts - 1) await sleep(retryMs);
    }
    let verifiedSig = null;
    if (ok && typeof sig === "string" && SIG_RE.test(sig)) {
      try {
        if (await withTimeout(escrow.verifyDepositSig(sig, { room, wallet }), readTimeoutMs)) verifiedSig = sig;
      } catch {}
    }
    if (ok) onReady(verifiedSig);
    else onNotReady();
    return reply({
      ok,
      sig: verifiedSig,
      message: ok ? null : "Your deposit isn't on the table account yet.",
    });
  } finally {
    ws._escrowConfirming = false;
  }
}

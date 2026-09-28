/**
 * Deposit hook: Phantom deeplink signTransaction in Expo Go (and whenever a Phantom session
 * exists); MWA signTransactions as the optional dev-build path. The app submits the signed
 * bytes to the RPC itself, then asks the match server to confirm by reading the room account.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Connection, Transaction } from "@solana/web3.js";
import { useConnection } from "../utils/ConnectionProvider";
import { isExpoGo } from "../utils/isExpoGo";
import { useMobileWallet } from "../utils/useMobileWallet";
import { cancelPhantomSign, connectPhantomDeeplink, loadPhantomSession, phantomSignTransaction, takeOrphanSignedTx } from "../utils/phantomDeeplink";
import { useAuthorization } from "../utils/useAuthorization";
import { EscrowSnapshot, matchClient } from "../match/MatchClient";
import { DepositStep, runDeposit } from "./depositFlow";
import { clientRpcProblem } from "./rpcGuard";

export function useDeposit(escrow: EscrowSnapshot | undefined, mySeat: number | null) {
  const { connection } = useConnection();
  const { signTransaction: mwaSign } = useMobileWallet();
  const { setMockAuthorization } = useAuthorization();
  const [state, setState] = useState<DepositStep | null>(null);
  const running = useRef(false);

  const conn = useMemo(() => {
    const rpc = matchClient.escrowInfo.clientRpc;
    // Only devnet or localhost/LAN; a mainnet (or unknown) override is ignored.
    if (rpc && !clientRpcProblem(rpc)) return new Connection(rpc, "confirmed");
    if (rpc) console.warn(`[escrow] ignoring clientRpc ${rpc}: ${clientRpcProblem(rpc)}`);
    return connection;
  }, [connection]);

  const start = useCallback(async () => {
    if (running.current || !escrow?.room || !escrow.mint || !escrow.programId || mySeat == null) return;
    const seat = escrow.seats[mySeat];
    const player = seat?.wallet ?? matchClient.wallet;
    if (!seat || !player) return setState({ step: "error", message: "Connect the wallet you joined with." });
    running.current = true;
    const usePhantom = isExpoGo() || !!(await loadPhantomSession());
    matchClient.depositSigning(true);
    try {
      const result = await runDeposit(
        { programId: escrow.programId, mint: escrow.mint, room: escrow.room, chainSeat: seat.chainSeat, player },
        {
          hasSession: async () => (usePhantom ? !!(await loadPhantomSession()) : true),
          reconnect: async () => {
            const acct = await connectPhantomDeeplink();
            await setMockAuthorization(acct);
            return acct.publicKey.toBase58();
          },
          getBlockhash: () => conn.getLatestBlockhash("confirmed"),
          sign: (tx: Transaction) =>
            // Back in the app without a Phantom answer → "Not approved" (no hanging spinner).
            usePhantom ? phantomSignTransaction(tx, { onReturnWithoutAnswer: () => cancelPhantomSign() }) : mwaSign(tx),
          sendAndConfirm: async (raw, bh) => {
            const sig = await conn.sendRawTransaction(raw, { maxRetries: 3, preflightCommitment: "confirmed" });
            try {
              const res = await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
              if (res.value.err) throw new Error(`deposit failed: ${JSON.stringify(res.value.err)}`);
            } catch (e: any) {
              // Expired while confirming: only a blockhash retry if it really didn't land.
              const st = (await conn.getSignatureStatuses([sig])).value[0];
              if (st && !st.err && st.confirmationStatus) return sig;
              throw e;
            }
            return sig;
          },
          confirmOnServer: (sig) => matchClient.confirmDeposit(sig).then((r) => ({ ok: r.ok, url: r.url, message: r.message ?? undefined })),
          takeOrphan: usePhantom ? () => takeOrphanSignedTx(150_000) : undefined,
          sendRaw: async (raw) => {
            await conn.sendRawTransaction(raw, { maxRetries: 3, skipPreflight: true });
          },
          sigStatus: async (sig) => {
            const st = (await conn.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0];
            if (!st || !st.confirmationStatus || st.confirmationStatus === "processed") return null;
            return st.err ? "failed" : "confirmed";
          },
          blockhashValid: async (blockhash) => (await conn.isBlockhashValid(blockhash, { commitment: "confirmed" })).value,
          onStep: (s) => {
            setState(s);
          },
        }
      );
      if (result.step !== "locked") matchClient.depositSigning(false);
    } finally {
      running.current = false;
    }
  }, [escrow, mySeat, conn, mwaSign, setMockAuthorization]);

  return { state, start, walletName: isExpoGo() ? "Phantom" : "wallet", reset: () => setState(null) };
}

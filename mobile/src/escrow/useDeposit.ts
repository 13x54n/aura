/**
 * Deposit hook: Phantom deeplink signTransaction in Expo Go (and whenever a Phantom session
 * exists); MWA signTransactions as the optional dev-build path. The app submits the signed
 * bytes to the RPC itself, then asks the match server to confirm by reading the room account.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Connection, Transaction } from "@solana/web3.js";
import { useConnection } from "../utils/ConnectionProvider";
import { isExpoGo } from "../utils/isExpoGo";
import { useMobileWallet } from "../utils/useMobileWallet";
import { cancelPhantomSign, connectPhantomDeeplink, loadPhantomSession, phantomSignTransaction, takeOrphanSignedTx } from "../utils/phantomDeeplink";
import { useAuthorization } from "../utils/useAuthorization";
import { EscrowSnapshot, matchClient } from "../match/MatchClient";
import { DepositStep, runDeposit, singleFlight, startDeposit } from "./depositFlow";
import { trackClientRpc, vetClientRpc } from "./rpcGuard";

export function useDeposit(escrow: EscrowSnapshot | undefined, mySeat: number | null) {
  const { connection } = useConnection();
  const { signTransaction: mwaSign } = useMobileWallet();
  const { setMockAuthorization } = useAuthorization();
  const [state, setState] = useState<DepositStep | null>(null);
  // Single flight: a second tap while a deposit is being prepared/signed does nothing.
  const gate = useRef(singleFlight((body: () => Promise<void>) => body()));

  // server.info may arrive after mount: follow it.
  const [clientRpc, setClientRpc] = useState<string | null>(matchClient.escrowInfo.clientRpc ?? null);
  useEffect(() => trackClientRpc(matchClient, setClientRpc), []);

  /** Deposit RPC: a vetted clientRpc (allowlist + devnet genesis for remote hosts), else the app RPC. */
  const pickConnection = useCallback(async (): Promise<Connection | "slow"> => {
    if (!clientRpc) return connection;
    // Genesis check times out after 5s → "Network is slow" + Try again (no silent fallback).
    // Not allowlisted / wrong genesis → the normal RPC. LAN/local hosts only in dev builds.
    const v = await vetClientRpc(clientRpc, (url) => new Connection(url, "confirmed").getGenesisHash(), {
      allowLocal: __DEV__,
      timeoutMs: 5000,
    });
    if (v.url) return new Connection(v.url, "confirmed");
    if (v.timedOut) return "slow";
    console.warn(`[escrow] ignoring clientRpc ${clientRpc}: ${v.reason}`);
    return connection;
  }, [clientRpc, connection]);

  const start = useCallback(() => gate.current(async () => {
    if (!escrow?.room || !escrow.mint || !escrow.programId || mySeat == null) return;
    const seat = escrow.seats[mySeat];
    const player = seat?.wallet ?? matchClient.wallet;
    if (!seat || !player) return setState({ step: "error", message: "Connect the wallet you joined with." });
    const target = { programId: escrow.programId, mint: escrow.mint, room: escrow.room, chainSeat: seat.chainSeat, player };
    // "Preparing transaction…" while the RPC is vetted; anything thrown here → startFailed
    // ("Couldn't start the deposit…" + Try again / Leave table; raw error only in the log).
    // The single-flight gate is released when this function settles.
    await startDeposit({
      onStep: setState,
      prepare: async () => {
        const conn = await pickConnection();
        if (conn === "slow") return "slow" as const;
        return { conn, usePhantom: isExpoGo() || !!(await loadPhantomSession()) };
      },
      run: ({ conn, usePhantom }) => deposit(conn, usePhantom),
    });

    async function deposit(conn: Connection, usePhantom: boolean) {
      matchClient.depositSigning(true);
      try {
        const result = await runDeposit(
          target,
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
      } catch (e) {
        matchClient.depositSigning(false);
        throw e;
      }
    }
  }), [escrow, mySeat, pickConnection, mwaSign, setMockAuthorization]);

  return { state, start, walletName: isExpoGo() ? "Phantom" : "wallet", reset: () => setState(null) };
}

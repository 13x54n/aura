import { Account, useAuthorization } from "./useAuthorization";
import {
  Transaction,
  TransactionSignature,
  VersionedTransaction,
} from "@solana/web3.js";
import { useCallback, useMemo } from "react";
import { isExpoGo } from "./isExpoGo";
import {
  clearPhantomSession,
  connectPhantomDeeplink,
} from "./phantomDeeplink";

/**
 * Wallet hook:
 * - Seeker / custom client → Seed Vault via MWA (preferred when present)
 * - Expo Go → real Phantom deeplink connect (M1 path; not mock)
 */
export function useMobileWallet() {
  const {
    authorizeSessionWithSignIn,
    authorizeSession,
    deauthorizeSession,
    setMockAuthorization,
    clearAuthorization,
  } = useAuthorization();

  const connect = useCallback(async (): Promise<Account> => {
    if (isExpoGo()) {
      const account = await connectPhantomDeeplink();
      await setMockAuthorization(account);
      return account;
    }
    const { transact } = await import(
      "@solana-mobile/mobile-wallet-adapter-protocol-web3js"
    );
    return await transact(async (wallet: any) => {
      return await authorizeSession(wallet);
    });
  }, [authorizeSession, setMockAuthorization]);

  const signIn = useCallback(
    async (signInPayload: {
      domain?: string;
      statement?: string;
      uri?: string;
    }): Promise<Account> => {
      if (isExpoGo()) {
        // Phantom connect is enough for Expo Go M1; SIWS can come later.
        return await connect();
      }
      const { transact } = await import(
        "@solana-mobile/mobile-wallet-adapter-protocol-web3js"
      );
      return await transact(async (wallet: any) => {
        return await authorizeSessionWithSignIn(wallet, signInPayload as any);
      });
    },
    [authorizeSessionWithSignIn, connect]
  );

  const disconnect = useCallback(async (): Promise<void> => {
    if (isExpoGo()) {
      await clearPhantomSession();
      await clearAuthorization();
      return;
    }
    const { transact } = await import(
      "@solana-mobile/mobile-wallet-adapter-protocol-web3js"
    );
    await transact(async (wallet: any) => {
      await deauthorizeSession(wallet);
    });
  }, [clearAuthorization, deauthorizeSession]);

  const signAndSendTransaction = useCallback(
    async (
      transaction: Transaction | VersionedTransaction,
      minContextSlot: number
    ): Promise<TransactionSignature> => {
      if (isExpoGo()) {
        throw new Error(
          "Signing via Phantom deeplink is not wired yet for this screen — use Connect for M1. Escrow signing lands with Seed Vault / full Phantom session methods."
        );
      }
      const { transact } = await import(
        "@solana-mobile/mobile-wallet-adapter-protocol-web3js"
      );
      return await transact(async (wallet: any) => {
        await authorizeSession(wallet);
        const signatures = await wallet.signAndSendTransactions({
          transactions: [transaction],
          minContextSlot,
        });
        return signatures[0];
      });
    },
    [authorizeSession]
  );

  const signMessage = useCallback(
    async (message: Uint8Array): Promise<Uint8Array> => {
      if (isExpoGo()) {
        throw new Error(
          "Message signing needs Phantom session methods or Seed Vault — Connect is live for M1."
        );
      }
      const { transact } = await import(
        "@solana-mobile/mobile-wallet-adapter-protocol-web3js"
      );
      return await transact(async (wallet: any) => {
        const authResult = await authorizeSession(wallet);
        const signedMessages = await wallet.signMessages({
          addresses: [authResult.address],
          payloads: [message],
        });
        return signedMessages[0];
      });
    },
    [authorizeSession]
  );

  return useMemo(
    () => ({
      connect,
      signIn,
      disconnect,
      signAndSendTransaction,
      signMessage,
      isExpoGo: isExpoGo(),
    }),
    [connect, signIn, disconnect, signAndSendTransaction, signMessage]
  );
}

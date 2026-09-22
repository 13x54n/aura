import { Account, useAuthorization } from "./useAuthorization";
import {
  Transaction,
  TransactionSignature,
  VersionedTransaction,
  PublicKey,
} from "@solana/web3.js";
import { useCallback, useMemo } from "react";
import { fromByteArray } from "js-base64";
import { isExpoGo } from "./isExpoGo";

/** Stable mock pubkey for Expo Go day-to-day smokes (not a real wallet). */
const MOCK_PUBKEY = new PublicKey(
  "11111111111111111111111111111112"
);

function mockAccount(label = "Expo Go mock"): Account {
  const bytes = MOCK_PUBKEY.toBytes();
  return {
    address: fromByteArray(bytes) as Account["address"],
    label,
    publicKey: MOCK_PUBKEY,
  };
}

/**
 * Wallet hook:
 * - Expo Go → mock connect (no native MWA; avoids SolanaMobileWalletAdapter crash)
 * - Custom / Seeker client → real MWA via dynamic require
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
      const account = mockAccount();
      await setMockAuthorization(account);
      return account;
    }
    // Dynamic import so Expo Go never loads the native TurboModule at startup.
    const { transact } = await import(
      "@solana-mobile/mobile-wallet-adapter-protocol-web3js"
    );
    return await transact(async (wallet: any) => {
      return await authorizeSession(wallet);
    });
  }, [authorizeSession, setMockAuthorization]);

  const signIn = useCallback(
    async (signInPayload: { domain?: string; statement?: string; uri?: string }): Promise<Account> => {
      if (isExpoGo()) {
        const account = mockAccount("Expo Go SIWS mock");
        await setMockAuthorization(account);
        return account;
      }
      const { transact } = await import(
        "@solana-mobile/mobile-wallet-adapter-protocol-web3js"
      );
      return await transact(async (wallet: any) => {
        return await authorizeSessionWithSignIn(wallet, signInPayload as any);
      });
    },
    [authorizeSessionWithSignIn, setMockAuthorization]
  );

  const disconnect = useCallback(async (): Promise<void> => {
    if (isExpoGo()) {
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
          "Signing needs the Seeker custom client (MWA). Expo Go is UI-only."
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
          "Signing needs the Seeker custom client (MWA). Expo Go is UI-only."
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

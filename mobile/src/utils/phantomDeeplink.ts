import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, AppStateStatus } from "react-native";
import { PublicKey, Transaction } from "@solana/web3.js";
import * as Linking from "expo-linking";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { fromUint8Array } from "js-base64";
import { Buffer } from "buffer";

import type { Account } from "./useAuthorization";
import { decryptPayload, encryptPayload, PhantomError, phantomErrorFrom } from "../escrow/phantomCrypto";

const APP_URL = "https://aura.app";
const CLUSTER = "devnet";
const KEYPAIR_STORAGE = "aura-phantom-dapp-keypair";
const SESSION_STORAGE = "aura-phantom-session";

type StoredKeyPair = { publicKey: string; secretKey: string };

type Pending = {
  resolve: (account: Account) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let pendingConnect: Pending | null = null;
let cachedKeyPair: nacl.BoxKeyPair | null = null;

function bytesToAccount(publicKey: PublicKey, label = "Phantom"): Account {
  return {
    address: fromUint8Array(publicKey.toBytes()) as Account["address"],
    label,
    publicKey,
  };
}

async function loadOrCreateKeyPair(): Promise<nacl.BoxKeyPair> {
  if (cachedKeyPair) return cachedKeyPair;
  const raw = await AsyncStorage.getItem(KEYPAIR_STORAGE);
  if (raw) {
    const parsed = JSON.parse(raw) as StoredKeyPair;
    cachedKeyPair = {
      publicKey: bs58.decode(parsed.publicKey),
      secretKey: bs58.decode(parsed.secretKey),
    };
    return cachedKeyPair;
  }
  const kp = nacl.box.keyPair();
  await AsyncStorage.setItem(
    KEYPAIR_STORAGE,
    JSON.stringify({
      publicKey: bs58.encode(kp.publicKey),
      secretKey: bs58.encode(kp.secretKey),
    } satisfies StoredKeyPair)
  );
  cachedKeyPair = kp;
  return kp;
}

function buildPhantomUrl(path: string, params: URLSearchParams): string {
  // Universal link — opens Phantom on device (works from Expo Go).
  return `https://phantom.app/ul/v1/${path}?${params.toString()}`;
}

/**
 * Open Phantom connect deeplink. Resolves when Expo Go receives the redirect.
 */
export async function connectPhantomDeeplink(): Promise<Account> {
  if (pendingConnect) {
    pendingConnect.reject(new Error("Another Phantom connect is in progress"));
    clearPending();
  }

  const dappKeyPair = await loadOrCreateKeyPair();
  const redirectLink = Linking.createURL("onConnect");
  const params = new URLSearchParams({
    dapp_encryption_public_key: bs58.encode(dappKeyPair.publicKey),
    cluster: CLUSTER,
    app_url: APP_URL,
    redirect_link: redirectLink,
  });
  const url = buildPhantomUrl("connect", params);

  return new Promise<Account>((resolve, reject) => {
    pendingConnect = {
      resolve,
      reject,
      timer: setTimeout(() => {
        if (pendingConnect) {
          pendingConnect.reject(
            new Error("Phantom connect timed out — approve in Phantom and return to Expo Go")
          );
          clearPending();
        }
      }, 120_000),
    };
    Linking.openURL(url).catch((err) => {
      clearPending();
      reject(
        err instanceof Error
          ? err
          : new Error("Could not open Phantom — is it installed?")
      );
    });
  });
}

function clearPending() {
  if (pendingConnect?.timer) clearTimeout(pendingConnect.timer);
  pendingConnect = null;
}

// ─── signTransaction (escrow deposits in Expo Go) ────────────────────────────

type StoredSession = { session: string; publicKey: string; sharedSecret: string; dappPublicKey: string };

export async function loadPhantomSession(): Promise<StoredSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_STORAGE);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    return s.session && s.sharedSecret ? s : null;
  } catch {
    return null;
  }
}

type PendingSign = {
  resolve: (tx: Transaction) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  url: string;
  appSub: { remove: () => void } | null;
  resumeTimer: ReturnType<typeof setTimeout> | null;
};
let pendingSign: PendingSign | null = null;
/** A signed tx that came back after Expo Go was reloaded (no promise waiting for it). */
let orphanSigned: { tx: Transaction; at: number } | null = null;

function clearPendingSign() {
  if (!pendingSign) return;
  clearTimeout(pendingSign.timer);
  if (pendingSign.resumeTimer) clearTimeout(pendingSign.resumeTimer);
  pendingSign.appSub?.remove();
  pendingSign = null;
}

/**
 * Phantom signTransaction deeplink (sign only; Phantom does not submit). The session from
 * connect (cluster devnet) is reused; the app submits the signed bytes itself.
 * `onReturnWithoutAnswer` fires if the user comes back to Expo Go and no redirect arrives.
 */
export async function phantomSignTransaction(
  tx: Transaction,
  opts: { onReturnWithoutAnswer?: () => void } = {}
): Promise<Transaction> {
  const s = await loadPhantomSession();
  if (!s) throw new PhantomError("session", "Connect Phantom first");
  if (tx.feePayer && tx.feePayer.toBase58() !== s.publicKey) {
    throw new PhantomError("wrong_wallet", "Phantom is connected to a different wallet");
  }
  if (pendingSign) {
    pendingSign.reject(new PhantomError("phantom_error", "Replaced by a newer Phantom request"));
    clearPendingSign();
  }
  const dappKeyPair = await loadOrCreateKeyPair();
  const { nonce, payload } = encryptPayload(
    {
      session: s.session,
      transaction: bs58.encode(tx.serialize({ requireAllSignatures: false, verifySignatures: false })),
    },
    bs58.decode(s.sharedSecret)
  );
  const params = new URLSearchParams({
    dapp_encryption_public_key: bs58.encode(dappKeyPair.publicKey),
    nonce,
    redirect_link: Linking.createURL("onSignTransaction"),
    payload,
    cluster: CLUSTER, // informational; the session was opened on devnet at connect
  });
  const url = buildPhantomUrl("signTransaction", params);

  return new Promise<Transaction>((resolve, reject) => {
    const p: PendingSign = {
      resolve,
      reject,
      url,
      resumeTimer: null,
      appSub: null,
      timer: setTimeout(() => {
        if (pendingSign === p) {
          p.reject(new PhantomError("no_response", "Didn't hear back from Phantom"));
          clearPendingSign();
        }
      }, 5 * 60_000),
    };
    // Back in Expo Go without a redirect (user switched apps): tell the UI after a short
    // grace so it can offer "Open Phantom again" — the promise stays open.
    p.appSub = AppState.addEventListener("change", (st: AppStateStatus) => {
      if (pendingSign !== p) return;
      if (st === "active") {
        if (p.resumeTimer) clearTimeout(p.resumeTimer);
        p.resumeTimer = setTimeout(() => pendingSign === p && opts.onReturnWithoutAnswer?.(), 2500);
      } else if (p.resumeTimer) {
        clearTimeout(p.resumeTimer);
        p.resumeTimer = null;
      }
    });
    pendingSign = p;
    Linking.openURL(url).catch(() => {
      if (pendingSign === p) clearPendingSign();
      reject(new PhantomError("phantom_error", "Could not open Phantom — is it installed?"));
    });
  });
}

/** Re-open the same Phantom request (user came back without answering). */
export function reopenPhantomSign(): boolean {
  if (!pendingSign) return false;
  void Linking.openURL(pendingSign.url);
  return true;
}

export function cancelPhantomSign() {
  if (!pendingSign) return;
  pendingSign.reject(new PhantomError("rejected", "Cancelled in Phantom"));
  clearPendingSign();
}

/** A signed deposit that arrived after an Expo Go reload (valid ~60-90s: blockhash). */
export function takeOrphanSignedTx(maxAgeMs = 60_000): Transaction | null {
  const o = orphanSigned;
  orphanSigned = null;
  return o && Date.now() - o.at < maxAgeMs ? o.tx : null;
}

async function handleSignRedirect(query: Record<string, string | undefined>): Promise<void> {
  const p = pendingSign;
  if (query.errorCode) {
    const err = phantomErrorFrom(query.errorCode, query.errorMessage);
    if (err.kind === "session") await clearPhantomSession();
    if (p) {
      p.reject(err);
      clearPendingSign();
    }
    return;
  }
  try {
    const s = await loadPhantomSession();
    if (!s || !query.data || !query.nonce) throw new PhantomError("session", "Phantom session missing");
    const out = decryptPayload(query.data, query.nonce, bs58.decode(s.sharedSecret));
    const tx = Transaction.from(bs58.decode(String(out.transaction ?? "")));
    if (p) {
      p.resolve(tx);
      clearPendingSign();
    } else {
      orphanSigned = { tx, at: Date.now() };
    }
  } catch (e) {
    if (p) {
      p.reject(e instanceof Error ? e : new Error(String(e)));
      clearPendingSign();
    }
  }
}

/**
 * Handle inbound Expo / app URL. Returns true if it was a Phantom callback.
 */
export async function handlePhantomRedirect(url: string): Promise<boolean> {
  if (!url || (!/onConnect/i.test(url) && !/phantom/i.test(url))) {
    // Still parse query for connect responses that land on createURL path
  }

  let query: Record<string, string | undefined> = {};
  try {
    const parsed = Linking.parse(url);
    query = (parsed.queryParams ?? {}) as Record<string, string | undefined>;
    const path = `${parsed.path ?? ""} ${parsed.hostname ?? ""} ${url}`;
    if (/onSignTransaction/i.test(path)) {
      await handleSignRedirect(query);
      return true;
    }
    if (!/onConnect/i.test(path) && !query.data) {
      return false;
    }
  } catch {
    return false;
  }

  if (query.errorCode) {
    const msg = query.errorMessage || `Phantom error ${query.errorCode}`;
    if (pendingConnect) {
      pendingConnect.reject(new Error(String(msg)));
      clearPending();
    }
    return true;
  }

  const phantomPk = query.phantom_encryption_public_key;
  const data = query.data;
  const nonce = query.nonce;
  if (!phantomPk || !data || !nonce) {
    return false;
  }

  try {
    const dappKeyPair = await loadOrCreateKeyPair();
    const sharedSecret = nacl.box.before(
      bs58.decode(phantomPk),
      dappKeyPair.secretKey
    );
    const connectData = decryptPayload(data, nonce, sharedSecret);
    const publicKeyStr = String(connectData.public_key ?? "");
    const session = String(connectData.session ?? "");
    if (!publicKeyStr) {
      throw new Error("Phantom connect missing public_key");
    }
    await AsyncStorage.setItem(
      SESSION_STORAGE,
      JSON.stringify({
        session,
        publicKey: publicKeyStr,
        sharedSecret: bs58.encode(sharedSecret),
        dappPublicKey: bs58.encode(dappKeyPair.publicKey),
      })
    );
    const account = bytesToAccount(new PublicKey(publicKeyStr), "Phantom");
    if (pendingConnect) {
      pendingConnect.resolve(account);
      clearPending();
    }
    return true;
  } catch (err) {
    if (pendingConnect) {
      pendingConnect.reject(
        err instanceof Error ? err : new Error(String(err))
      );
      clearPending();
    }
    return true;
  }
}

export async function clearPhantomSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_STORAGE);
}

/** Subscribe once from App root — keeps Connect promise wired across redirect. */
export function attachPhantomLinkListener(): () => void {
  const onUrl = ({ url }: { url: string }) => {
    void handlePhantomRedirect(url);
  };
  const sub = Linking.addEventListener("url", onUrl);
  void Linking.getInitialURL().then((url) => {
    if (url) void handlePhantomRedirect(url);
  });
  return () => sub.remove();
}

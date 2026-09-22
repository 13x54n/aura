import AsyncStorage from "@react-native-async-storage/async-storage";
import { PublicKey } from "@solana/web3.js";
import * as Linking from "expo-linking";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { fromUint8Array } from "js-base64";
import { Buffer } from "buffer";

import type { Account } from "./useAuthorization";

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

function decryptPayload(
  data: string,
  nonce: string,
  sharedSecret: Uint8Array
): Record<string, unknown> {
  const opened = nacl.box.open.after(
    bs58.decode(data),
    bs58.decode(nonce),
    sharedSecret
  );
  if (!opened) {
    throw new Error("Unable to decrypt Phantom payload");
  }
  return JSON.parse(Buffer.from(opened).toString("utf8"));
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

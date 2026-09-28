/**
 * Phantom deeplink encryption (x25519-xsalsa20-poly1305 via tweetnacl box, base58 wire).
 * Pure: no React Native imports, so node unit tests can run it directly.
 */
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Buffer } from "buffer";

/** Shared secret between our dapp keypair and Phantom's per-session encryption key. */
export function sharedSecretFor(phantomEncryptionPublicKeyB58: string, dappSecretKey: Uint8Array): Uint8Array {
  return nacl.box.before(bs58.decode(phantomEncryptionPublicKeyB58), dappSecretKey);
}

/** Encrypt a request payload. Returns base58 nonce + payload for the query string. */
export function encryptPayload(obj: unknown, sharedSecret: Uint8Array): { nonce: string; payload: string } {
  const nonce = nacl.randomBytes(24);
  const boxed = nacl.box.after(Buffer.from(JSON.stringify(obj)), nonce, sharedSecret);
  return { nonce: bs58.encode(nonce), payload: bs58.encode(boxed) };
}

/** Decrypt a Phantom response (`data` + `nonce` query params, base58). Throws if tampered. */
export function decryptPayload(data: string, nonce: string, sharedSecret: Uint8Array): Record<string, unknown> {
  const opened = nacl.box.open.after(bs58.decode(data), bs58.decode(nonce), sharedSecret);
  if (!opened) throw new Error("Unable to decrypt Phantom payload");
  return JSON.parse(Buffer.from(opened).toString("utf8"));
}

/** Phantom deeplink error codes → what the deposit flow does next. */
export type PhantomErrorKind = "rejected" | "session" | "no_response" | "wrong_wallet" | "phantom_error";

export class PhantomError extends Error {
  kind: PhantomErrorKind;
  code?: string;
  constructor(kind: PhantomErrorKind, message: string, code?: string) {
    super(message);
    this.kind = kind;
    this.code = code;
  }
}

/** Map an errorCode/errorMessage redirect to a PhantomError. 4001 = user rejected. */
export function phantomErrorFrom(errorCode: string | undefined, errorMessage: string | undefined): PhantomError {
  const code = String(errorCode ?? "");
  const msg = String(errorMessage ?? `Phantom error ${code}`);
  if (code === "4001" || /reject|cancel|denied|declin/i.test(msg)) return new PhantomError("rejected", "Not approved", code);
  if (code === "4100" || code === "4900" || /session|unauthori|not connected|disconnected/i.test(msg)) {
    return new PhantomError("session", "Phantom session expired", code);
  }
  return new PhantomError("phantom_error", msg, code);
}

import { getRandomValues as expoCryptoGetRandomValues } from "expo-crypto";
import { Buffer } from "buffer";

global.Buffer = Buffer;

class Crypto {
  getRandomValues = expoCryptoGetRandomValues;
}

const webCrypto = new Crypto();

(() => {
  const g = globalThis as any;
  const existing = g.crypto;
  if (!existing || typeof existing.getRandomValues !== "function") {
    Object.defineProperty(g, "crypto", {
      configurable: true,
      enumerable: true,
      get: () => webCrypto,
    });
  }
  // RN sometimes exposes window separately from globalThis
  if (typeof g.window !== "undefined") {
    const w = g.window;
    if (!w.crypto || typeof w.crypto.getRandomValues !== "function") {
      Object.defineProperty(w, "crypto", {
        configurable: true,
        enumerable: true,
        get: () => webCrypto,
      });
    }
  }
})();

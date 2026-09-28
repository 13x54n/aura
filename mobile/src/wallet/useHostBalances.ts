import { useCallback, useEffect, useState } from "react";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useConnection } from "../utils/ConnectionProvider";
import { useAuthorization } from "../utils/useAuthorization";

/** Devnet USDC mint (Circle faucet). */
export const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

/**
 * SKR mint is set per cluster via EXPO_PUBLIC_SKR_MINT. Unset → SKR shows "—"
 * (never a made-up balance).
 */
const SKR_MINT = (() => {
  try {
    const m = process.env.EXPO_PUBLIC_SKR_MINT;
    return m ? new PublicKey(m) : null;
  } catch {
    return null;
  }
})();

export type HostBalances = {
  usdc: number | null;
  sol: number | null;
  skr: number | null;
  skrConfigured: boolean;
  loading: boolean;
  connected: boolean;
  address: string | null;
  refresh: () => void;
};

type Snapshot = { usdc: number | null; sol: number | null; skr: number | null };

/**
 * One cache per wallet address shared by every mounted card (hub + Wallet tab),
 * with in-flight de-dupe, a short freshness window and quiet 429 backoff.
 * On any failure the last good balances stay on screen.
 */
const FRESH_MS = 20_000;
const cache = new Map<string, { snap: Snapshot; at: number }>();
const inflight = new Map<string, Promise<Snapshot | null>>();
let cooldownUntil = 0;
let backoffMs = 0;

const is429 = (e: any) => /429|Too Many Requests/i.test(String(e?.message ?? e));

async function fetchBalances(connection: Connection, owner: PublicKey): Promise<Snapshot | null> {
  const key = owner.toBase58();
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    try {
      const tokenTotal = async (mint: PublicKey) => {
        const res = await connection.getParsedTokenAccountsByOwner(owner, { mint });
        return res.value.reduce((s, a) => s + (a.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0), 0);
      };
      const [usdc, lamports, skr] = await Promise.all([
        tokenTotal(USDC_MINT),
        connection.getBalance(owner),
        SKR_MINT ? tokenTotal(SKR_MINT) : Promise.resolve(null),
      ]);
      const snap = { usdc, sol: lamports / LAMPORTS_PER_SOL, skr };
      cache.set(key, { snap, at: Date.now() });
      backoffMs = 0;
      return snap;
    } catch (e) {
      if (is429(e)) {
        backoffMs = Math.min(backoffMs ? backoffMs * 2 : 2000, 60_000);
        cooldownUntil = Date.now() + backoffMs;
      }
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/** Host-only reads of the connected wallet. The WebView games never see these. */
export function useHostBalances(): HostBalances {
  const { connection } = useConnection();
  const { selectedAccount } = useAuthorization();
  const owner = selectedAccount?.publicKey;
  const key = owner?.toBase58() ?? null;
  const [snap, setSnap] = useState<Snapshot | null>(key ? cache.get(key)?.snap ?? null : null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    if (!owner || !key) {
      setSnap(null);
      return;
    }
    const hit = cache.get(key);
    if (hit) setSnap(hit.snap);
    const forced = tick > 0;
    const fresh = hit && Date.now() - hit.at < FRESH_MS;
    if ((fresh && !forced) || Date.now() < cooldownUntil) return;
    setLoading(true);
    fetchBalances(connection, owner)
      .then((s) => alive && s && setSnap(s))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // Keyed on the address and manual refresh only, never on object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  return {
    usdc: snap?.usdc ?? null, sol: snap?.sol ?? null, skr: snap?.skr ?? null,
    skrConfigured: !!SKR_MINT, loading,
    connected: !!owner, address: key, refresh,
  };
}

import { useCallback, useEffect, useState } from "react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useConnection } from "../utils/ConnectionProvider";
import { useAuthorization } from "../utils/useAuthorization";
import { USDC_MINT } from "../screens/ludo/useHostUsdc";

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

/** Host-only reads of the connected wallet. The WebView games never see these. */
export function useHostBalances(): HostBalances {
  const { connection } = useConnection();
  const { selectedAccount } = useAuthorization();
  const owner = selectedAccount?.publicKey;
  const [usdc, setUsdc] = useState<number | null>(null);
  const [sol, setSol] = useState<number | null>(null);
  const [skr, setSkr] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    if (!owner) {
      setUsdc(null);
      setSol(null);
      setSkr(null);
      return;
    }
    const tokenTotal = (mint: PublicKey) =>
      connection
        .getParsedTokenAccountsByOwner(owner, { mint })
        .then((res) =>
          res.value.reduce((s, a) => s + (a.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0), 0)
        )
        .catch(() => null);
    setLoading(true);
    Promise.all([
      tokenTotal(USDC_MINT),
      connection.getBalance(owner).then((l) => l / LAMPORTS_PER_SOL).catch(() => null),
      SKR_MINT ? tokenTotal(SKR_MINT) : Promise.resolve(null),
    ])
      .then(([u, s, k]) => {
        if (!alive) return;
        setUsdc(u);
        setSol(s);
        setSkr(k);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [connection, owner?.toBase58(), tick]);

  return {
    usdc, sol, skr, skrConfigured: !!SKR_MINT, loading,
    connected: !!owner, address: owner?.toBase58() ?? null, refresh,
  };
}

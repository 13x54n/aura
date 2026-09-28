import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "../../utils/ConnectionProvider";
import { useAuthorization } from "../../utils/useAuthorization";

/** Devnet USDC mint (Circle). Host-only read — the WebView never sees this. */
export const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

/** Reads the connected host wallet's USDC balance. null = not connected / unknown. */
export function useHostUsdc() {
  const { connection } = useConnection();
  const { selectedAccount } = useAuthorization();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const owner = selectedAccount?.publicKey;

  useEffect(() => {
    let alive = true;
    if (!owner) {
      setBalance(null);
      return;
    }
    setLoading(true);
    connection
      .getParsedTokenAccountsByOwner(owner, { mint: USDC_MINT })
      .then((res) => {
        if (!alive) return;
        const total = res.value.reduce(
          (sum, a) => sum + (a.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0),
          0
        );
        setBalance(total);
      })
      .catch(() => alive && setBalance(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [connection, owner?.toBase58()]);

  return { balance, loading, connected: !!owner, address: owner?.toBase58() ?? null };
}

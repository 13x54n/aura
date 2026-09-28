/**
 * Shared Ludo room helpers. No mock data: players, tables and history always
 * come from the match server; balance always comes from the host wallet.
 */
import { useEffect, useState } from "react";
import { useAuthorization } from "../../utils/useAuthorization";
import { EscrowInfo, matchClient } from "../../match/MatchClient";

/** Paid stakes the escrow program accepts (USDC, 6 decimals). */
export const PAID_STAKE_CHIPS = [1, 3, 5, 10] as const;

/**
 * Paid chips unlock only when the match server reports escrow live (server.info)
 * AND a wallet is connected. Otherwise every table is a 0 USDC friendly.
 */
export function useEscrowStatus(): { live: boolean; walletReady: boolean; info: EscrowInfo } {
  const { selectedAccount } = useAuthorization();
  const [info, setInfo] = useState<EscrowInfo>(matchClient.escrowInfo);
  useEffect(() => {
    let on = true;
    matchClient.getServerInfo().then((i) => on && setInfo({ ...i })).catch(() => {});
    return () => {
      on = false;
    };
  }, []);
  return { live: !!info.live, walletReady: !!selectedAccount, info };
}

/** Board colours by server seat index (matches games/ludo COLORS). */
export const BOARD_SEAT_COLORS: Record<number, string> = {
  0: "#2563EB",
  1: "#EAB308",
  2: "#16A34A",
  3: "#DC2626",
};

export function newTableCode(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

export const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** The name other players see: short wallet address, or this install's guest name. */
export function usePlayerName(): string {
  const { selectedAccount } = useAuthorization();
  const wallet = selectedAccount ? selectedAccount.publicKey.toBase58() : null;
  // Staked seats are bound to this wallet on-chain; the server needs it on create/join/random.
  useEffect(() => matchClient.setWallet(wallet), [wallet]);
  return selectedAccount ? shortAddress(selectedAccount.publicKey.toBase58()) : matchClient.guestName;
}

/** Payout = pot minus 5% house fee (display only; the program computes the real split). */
export function payoutFor(stake: number, players: number) {
  const pot = stake * players;
  const fee = +(pot * 0.05).toFixed(2);
  return { pot, fee, payout: +(pot - fee).toFixed(2) };
}

export function modeFor(players: number): "2p" | "3p" | "4p" {
  return players <= 2 ? "2p" : players === 3 ? "3p" : "4p";
}

export function whenLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday · ${time}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

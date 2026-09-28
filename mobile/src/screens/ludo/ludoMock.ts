/**
 * Mock match data for the Ludo wireframe screens (Gate 2).
 * Replaced by the rooms backend later — never a fake balance: balance always
 * comes from the host wallet (see useHostUsdc).
 */
export const STAKE_CHIPS = [1, 5, 10, 25] as const;

export type MockSeat = { name: string; color: string; ready: boolean; you?: boolean };

export const SEAT_COLORS = ["#EF4444", "#22C55E", "#3B82F6", "#EAB308"];

export function mockCode(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

export function mockSeats(players: number, youReady = false): MockSeat[] {
  const names = ["You", "Maya", "Kofi", "Iris"];
  return Array.from({ length: players }, (_, i) => ({
    name: names[i],
    color: SEAT_COLORS[i],
    ready: i === 0 ? youReady : i !== players - 1,
    you: i === 0,
  }));
}

export type LedgerRow = {
  id: string;
  code: string;
  players: number;
  stake: number;
  result: "won" | "lost";
  delta: number;
  when: string;
};

/** Example history (mock) until the rooms backend records real matches. */
export const MOCK_LEDGER: LedgerRow[] = [
  { id: "m1", code: "K7Q2XP", players: 4, stake: 5, result: "won", delta: 14.25, when: "Today · 4:12 PM" },
  { id: "m2", code: "RND-4821", players: 2, stake: 1, result: "lost", delta: -1, when: "Today · 1:03 PM" },
  { id: "m3", code: "ZP9M3C", players: 3, stake: 10, result: "won", delta: 19, when: "Yesterday" },
  { id: "m4", code: "RND-1177", players: 2, stake: 5, result: "lost", delta: -5, when: "Sep 26" },
];

/** Payout = pot minus 5% house fee (mock rule, mirrors LUDO_RULEBOOK draft). */
export function payoutFor(stake: number, players: number) {
  const pot = stake * players;
  const fee = +(pot * 0.05).toFixed(2);
  return { pot, fee, payout: +(pot - fee).toFixed(2) };
}

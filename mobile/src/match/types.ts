/** Classic Ludo rule profile + match events (server-authoritative stub). */

export const RULE_PROFILE = {
  profileId: "classic-v1",
  piecesPerPlayer: 4,
  enterRoll: 6,
  extraTurnOnSix: true,
  maxConsecutiveSixes: 3,
  exactFinish: true,
  blockades: false,
  turnTimeoutMs: 20_000,
} as const;

export type MatchPhase = "lobby" | "turn" | "rolled" | "completed";

export type MatchCommand =
  | { type: "join"; seat?: number }
  | { type: "ready" }
  | { type: "roll" }
  | { type: "move"; pieceIndex: number }
  | { type: "forfeit" };

export type MatchEvent =
  | { type: "match.created"; matchId: string; profileId: string }
  | { type: "seat.joined"; seat: number }
  | { type: "match.started"; turnSeat: number }
  | { type: "die.rolled"; seat: number; value: number; sixStreak: number }
  | { type: "piece.moved"; seat: number; pieceIndex: number; progress: number }
  | { type: "turn.changed"; turnSeat: number }
  | { type: "match.completed"; winnerSeat: number; reason: string };

export type MatchSnapshot = {
  matchId: string;
  phase: MatchPhase;
  turnSeat: number;
  die: number | null;
  sixStreak: number;
  seats: number;
  pieces: number[][]; // seat -> 4 progress values (-1 yard, 0..56 track, 57 finished)
  events: MatchEvent[];
  winnerSeat: number | null;
};

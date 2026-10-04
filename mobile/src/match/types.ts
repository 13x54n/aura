/**
 * Game-agnostic match types for Aura marketplace
 * Individual games (Ludo, Chess, Snakes) extend these base types
 */

export type GameType = "ludo" | "chess" | "snakes";

export type MatchPhase = "lobby" | "turn" | "rolled" | "completed" | string;

// Base command types that all games can use
export type BaseMatchCommand =
  | { type: "join"; seat?: number }
  | { type: "ready" }
  | { type: "forfeit" };

// Game-specific commands can extend this
export type MatchCommand =
  | BaseMatchCommand
  | { type: "roll" } // Dice games: Ludo, Snakes
  | { type: "move"; pieceIndex?: number; from?: string; to?: string; data?: any }; // Generic move

// Base event types
export type BaseMatchEvent =
  | { type: "match.created"; matchId: string; profileId: string; gameType: GameType }
  | { type: "seat.joined"; seat: number }
  | { type: "match.started"; turnSeat: number }
  | { type: "turn.changed"; turnSeat: number }
  | { type: "match.completed"; winnerSeat: number; reason: string };

// Game-specific events can extend this
export type MatchEvent =
  | BaseMatchEvent
  | { type: "die.rolled"; seat: number; value: number; sixStreak?: number }
  | { type: "piece.moved"; seat: number; pieceIndex: number; progress: number; from?: any; to?: any }
  | { type: string; [key: string]: any }; // Allow custom game events

export type MatchSnapshot = {
  matchId: string;
  gameType: GameType;
  phase: MatchPhase;
  turnSeat: number;
  seats: number;
  events: MatchEvent[];
  winnerSeat: number | null;
  // Game-specific state (flexible)
  gameState?: {
    die?: number | null;
    sixStreak?: number;
    pieces?: number[][];
    board?: any;
    moves?: any[];
    [key: string]: any;
  };
};

// Ludo-specific rule profile (moved from top-level to namespace)
export const LUDO_RULE_PROFILE = {
  profileId: "classic-v1",
  gameType: "ludo" as const,
  piecesPerPlayer: 4,
  enterRoll: 6,
  extraTurnOnSix: true,
  maxConsecutiveSixes: 3,
  exactFinish: true,
  blockades: false,
  turnTimeoutMs: 20_000,
} as const;

// Legacy export for backward compatibility
export const RULE_PROFILE = LUDO_RULE_PROFILE;

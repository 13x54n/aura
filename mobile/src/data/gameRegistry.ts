/**
 * Game Registry - Aura's pluggable mini-app system
 * Each game can define its own hub, multiplayer support, and escrow rules independently.
 */
import { ComponentType } from "react";
import { AuraGameId } from "./catalog";

export type GameHubMode = "deep" | "playable";

export type GameMultiplayerConfig = {
  enabled: boolean;
  /** Room modes this game supports (e.g., 2p, 3p, 4p for Ludo) */
  modes?: string[];
  /** Whether this game supports private rooms */
  supportsPrivateRooms?: boolean;
  /** Whether this game supports quick match */
  supportsQuickMatch?: boolean;
  /** Whether this game has dedicated room creation flow */
  hasCustomRoomFlow?: boolean;
};

export type GameEscrowConfig = {
  /** Whether this game supports staked matches */
  enabled: boolean;
  /** Supported stake amounts in USDC */
  stakes?: number[];
};

export type GameConfig = {
  id: AuraGameId;
  /** Hub component - can be deep (like Ludo) or simple playable screen */
  hubComponent: ComponentType<any>;
  /** Hub route name for navigation */
  hubRoute: string;
  /** Multiplayer configuration */
  multiplayer: GameMultiplayerConfig;
  /** Escrow/staking configuration */
  escrow: GameEscrowConfig;
  /** Game type identifier for match server */
  gameType: string;
};

/**
 * Game Registry - add new games here
 */
export const GAME_REGISTRY = new Map<AuraGameId, GameConfig>();

/**
 * Register a game configuration
 */
export function registerGame(config: GameConfig) {
  GAME_REGISTRY.set(config.id, config);
}

/**
 * Get game configuration
 */
export function getGameConfig(gameId: AuraGameId): GameConfig | undefined {
  return GAME_REGISTRY.get(gameId);
}

/**
 * Check if a game supports multiplayer
 */
export function supportsMultiplayer(gameId: AuraGameId): boolean {
  const config = GAME_REGISTRY.get(gameId);
  return config?.multiplayer.enabled ?? false;
}

/**
 * Check if a game supports escrow
 */
export function supportsEscrow(gameId: AuraGameId): boolean {
  const config = GAME_REGISTRY.get(gameId);
  return config?.escrow.enabled ?? false;
}

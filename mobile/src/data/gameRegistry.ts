/**
 * Optional host metadata for a listed mini-game.
 * Games are not authored in this repo — a listing's entryUrl is what Aura mounts.
 */
import { ComponentType } from "react";
import { AuraGameId } from "./catalog";

export type GameHubMode = "deep" | "playable";

export type GameMultiplayerConfig = {
  enabled: boolean;
  /** Room modes this game supports */
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
  /** Optional host screen. Most titles open straight into the WebView. */
  hubComponent?: ComponentType<any>;
  /** Hub route name for navigation */
  hubRoute: string;
  /** Multiplayer configuration */
  multiplayer: GameMultiplayerConfig;
  /** Escrow/staking configuration */
  escrow: GameEscrowConfig;
  /** Game type identifier */
  gameType: string;
};

/**
 * Registered listings. Empty until a catalog entry needs host metadata.
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

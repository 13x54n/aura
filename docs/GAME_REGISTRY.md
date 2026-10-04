# Aura Game Registry

## Overview

The Game Registry is Aura's pluggable mini-app system that enables **independent game operation**. Each game (Ludo, Chess, Snakes, etc.) registers its configuration, defining how it integrates with the Aura marketplace.

## Key Principle

**Aura is a marketplace, NOT a Ludo app with extras.** Each mini-app operates independently with:
- Its own hub screen
- Its own multiplayer configuration
- Its own escrow rules
- Its own game logic

## Registry Structure

Location: `mobile/src/data/gameRegistry.ts`

### GameConfig Type

```typescript
type GameConfig = {
  id: AuraGameId;
  hubComponent: ComponentType<any>;
  hubRoute: string;
  multiplayer: GameMultiplayerConfig;
  escrow: GameEscrowConfig;
  gameType: string;
};
```

### Multiplayer Configuration

```typescript
type GameMultiplayerConfig = {
  enabled: boolean;
  modes?: string[]; // e.g., ["2p", "3p", "4p"]
  supportsPrivateRooms?: boolean;
  supportsQuickMatch?: boolean;
  hasCustomRoomFlow?: boolean;
};
```

### Escrow Configuration

```typescript
type GameEscrowConfig = {
  enabled: boolean;
  stakes?: number[]; // Supported stake amounts in USDC
};
```

## Adding a New Game

### 1. Create Game Configuration

Create a config file at `mobile/src/data/games/<gameName>Config.ts`:

```typescript
import { GameConfig } from "../gameRegistry";
import { MyGameHubScreen } from "../../screens/games/MyGameHubScreen";

export const MY_GAME_CONFIG: GameConfig = {
  id: "mygame",
  hubComponent: MyGameHubScreen,
  hubRoute: "MyGameHub",
  multiplayer: {
    enabled: true,
    modes: ["2p"],
    supportsPrivateRooms: true,
    supportsQuickMatch: true,
    hasCustomRoomFlow: false,
  },
  escrow: {
    enabled: true,
    stakes: [1, 3, 5],
  },
  gameType: "mygame",
};
```

### 2. Register in Index

Add to `mobile/src/data/games/index.ts`:

```typescript
import { MY_GAME_CONFIG } from "./myGameConfig";

registerGame(MY_GAME_CONFIG);
```

### 3. Add to Catalog

Add your game to `mobile/src/data/catalog.ts`:

```typescript
export type AuraGameId = "ludo" | "chess" | "snakes" | "mygame";

export const AURA_GAMES: AuraGame[] = [
  // ... existing games
  {
    id: "mygame",
    title: "My Game",
    subtitle: "Game subtitle",
    blurb: "Game description",
    route: "MyGameHub",
    accent: "#HEXCOLOR",
    imageUrl: "https://...",
    icon: require("../../assets/games/mygame/icon.png"),
    cover: require("../../assets/games/mygame/cover.png"),
    depth: "playable",
  },
];
```

### 4. Create Hub Screen

Create your hub screen at `mobile/src/screens/games/MyGameHubScreen.tsx`:

```typescript
import { PlayableHubScreen } from "./PlayableHubScreen";

export function MyGameHubScreen() {
  return (
    <PlayableHubScreen
      gameId="mygame"
      title="My Game"
      blurb="Game description"
      badge="Playable"
    />
  );
}
```

### 5. Add Navigation Route

Update `mobile/src/navigators/AppNavigator.tsx`:

```typescript
<Stack.Screen
  name="MyGameHub"
  component={Screens.MyGameHubScreen}
  options={{ headerShown: false }}
/>
```

### 6. Pack Game Bundle

Create a pack script at `scripts/pack-mygame.mjs` and run it to generate the WebView bundle.

### 7. Add Game Assets

Place required assets:
- `games/mygame/icon.png` (square, 512x512 recommended)
- `games/mygame/cover.png` (portrait, 2:3 ratio recommended)
- `games/mygame/manifest.json`

### 8. Update Match Server (if multiplayer)

If your game supports multiplayer, extend the match server at `server/match-server.mjs` to handle your game's specific rules.

## Current Games

### Ludo
- **Status**: Deep implementation with full multiplayer
- **Hub**: Custom LudoHubScreen with Create/Join/Quick match flows
- **Multiplayer**: 2p, 3p, 4p rooms
- **Escrow**: Enabled (1, 3, 5, 10 USDC)
- **Match Server**: Full implementation

### Chess
- **Status**: Playable (Free Play only)
- **Hub**: Generic PlayableHubScreen
- **Multiplayer**: Disabled (planned)
- **Escrow**: Disabled (planned)
- **Match Server**: Not yet implemented

### Snakes & Ladders
- **Status**: Playable (Free Play only)
- **Hub**: Generic PlayableHubScreen
- **Multiplayer**: Disabled (planned)
- **Escrow**: Disabled (planned)
- **Match Server**: Not yet implemented

## API Reference

### Registry Functions

```typescript
// Register a game
registerGame(config: GameConfig): void

// Get game configuration
getGameConfig(gameId: AuraGameId): GameConfig | undefined

// Check if game supports multiplayer
supportsMultiplayer(gameId: AuraGameId): boolean

// Check if game supports escrow
supportsEscrow(gameId: AuraGameId): boolean
```

## Design Principles

1. **Independence**: Each game is self-contained and doesn't depend on other games
2. **Discoverability**: Games register themselves; the host discovers capabilities
3. **Flexibility**: Games can have custom hubs (like Ludo) or use generic screens
4. **Gradual Enhancement**: Start with Free Play, add multiplayer/escrow when ready
5. **Type Safety**: Full TypeScript support throughout the registry

## Testing

When adding a game, verify:
- [ ] Game appears in Home carousel and Arcade shelf
- [ ] Icon and cover images load correctly
- [ ] Tapping game tile opens the hub screen
- [ ] Free Play button launches the WebView board
- [ ] Game logic works (roll dice, move pieces, etc.)
- [ ] Back button returns to the hub
- [ ] Game is listed in the correct catalog categories

## Future Enhancements

- Manifest validation (schema enforcement)
- Capability permissions system
- Game versioning and updates
- Dynamic game loading (download on demand)
- Third-party game submission portal
- Game-specific analytics
- Cross-game achievements

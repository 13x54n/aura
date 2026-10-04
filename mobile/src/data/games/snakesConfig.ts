/**
 * Snakes & Ladders game configuration
 */
import { GameConfig } from "../gameRegistry";
import { SnakesHubScreen } from "../../screens/games/SnakesHubScreen";

export const SNAKES_CONFIG: GameConfig = {
  id: "snakes",
  hubComponent: SnakesHubScreen,
  hubRoute: "SnakesHub",
  multiplayer: {
    enabled: false, // To be enabled when snakes multiplayer is ready
    modes: ["2p", "3p", "4p"],
    supportsPrivateRooms: false,
    supportsQuickMatch: false,
    hasCustomRoomFlow: false,
  },
  escrow: {
    enabled: false, // To be enabled when snakes multiplayer is ready
    stakes: [1, 3, 5, 10],
  },
  gameType: "snakes",
};

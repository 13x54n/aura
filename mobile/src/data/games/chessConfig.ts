/**
 * Chess game configuration
 */
import { GameConfig } from "../gameRegistry";
import { ChessHubScreen } from "../../screens/games/ChessHubScreen";

export const CHESS_CONFIG: GameConfig = {
  id: "chess",
  hubComponent: ChessHubScreen,
  hubRoute: "ChessHub",
  multiplayer: {
    enabled: false, // To be enabled when chess multiplayer is ready
    modes: ["2p"],
    supportsPrivateRooms: false,
    supportsQuickMatch: false,
    hasCustomRoomFlow: false,
  },
  escrow: {
    enabled: false, // To be enabled when chess multiplayer is ready
    stakes: [1, 3, 5, 10],
  },
  gameType: "chess",
};

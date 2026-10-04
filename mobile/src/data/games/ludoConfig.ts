/**
 * Ludo game configuration
 */
import { GameConfig } from "../gameRegistry";
import { LudoHubScreen } from "../../screens/ludo/LudoHubScreen";

export const LUDO_CONFIG: GameConfig = {
  id: "ludo",
  hubComponent: LudoHubScreen,
  hubRoute: "LudoHub",
  multiplayer: {
    enabled: true,
    modes: ["2p", "3p", "4p"],
    supportsPrivateRooms: true,
    supportsQuickMatch: true,
    hasCustomRoomFlow: true,
  },
  escrow: {
    enabled: true,
    stakes: [1, 3, 5, 10],
  },
  gameType: "ludo",
};

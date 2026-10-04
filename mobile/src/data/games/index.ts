/**
 * Game registry initialization
 * Import and register all available games
 */
import { registerGame } from "../gameRegistry";
import { LUDO_CONFIG } from "./ludoConfig";
import { CHESS_CONFIG } from "./chessConfig";
import { SNAKES_CONFIG } from "./snakesConfig";

// Register all games on import
registerGame(LUDO_CONFIG);
registerGame(CHESS_CONFIG);
registerGame(SNAKES_CONFIG);

// Re-export configs for direct access if needed
export { LUDO_CONFIG, CHESS_CONFIG, SNAKES_CONFIG };

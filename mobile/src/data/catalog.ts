/** Real Aura titles only — Ludo deep; Chess + Snakes Playable first. */
export type AuraGameId = "ludo" | "chess" | "snakes";

export type AuraGame = {
  id: AuraGameId;
  title: string;
  subtitle: string;
  blurb: string;
  route: "LudoHub" | "ChessHub" | "SnakesHub";
  accent: string;
  imageUrl: string;
  depth: "deep" | "playable";
};

export const AURA_GAMES: AuraGame[] = [
  {
    id: "ludo",
    title: "Ludo",
    subtitle: "Skill · SOL escrow · CLOCK IN",
    blurb: "Craft skill matches · stake · play",
    route: "LudoHub",
    accent: "#3B1D6E",
    imageUrl:
      "https://images.unsplash.com/photo-1642056445424-fc9059cb737a?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    depth: "deep",
  },
  {
    id: "chess",
    title: "Chess",
    subtitle: "Pure skill escrow",
    blurb: "Head-to-head skill · stake · winner takes the pot",
    route: "ChessHub",
    accent: "#1E3A5F",
    imageUrl:
      "https://images.unsplash.com/photo-1695480542225-bc22cac128d0?q=80&w=995&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    depth: "playable",
  },
  {
    id: "snakes",
    title: "Snakes & Ladders",
    subtitle: "Skill + fair dice",
    blurb: "Climb · slide · commit-reveal dice · escrow",
    route: "SnakesHub",
    accent: "#14532D",
    imageUrl:
      "https://images.unsplash.com/photo-1642056447310-b2163a0218b8?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    depth: "playable",
  },
];

/** Stack route for WebView Play handoff. */
export function webGameParams(game: AuraGame): { gameId: string; title: string } {
  return { gameId: game.id, title: game.title };
}

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
      "https://images.unsplash.com/photo-1596687909057-dfac2b25b891?w=1200&q=80",
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
      "https://images.unsplash.com/photo-1677816155981-919b9a6eeded?w=1200&q=80",
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
      "https://images.unsplash.com/photo-1667118398882-fe8fd62665c6?w=1200&q=80",
    depth: "playable",
  },
];

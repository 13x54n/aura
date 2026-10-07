/** Store listings. This repo does not ship games — a title arrives as a URL. */
import { ImageSourcePropType } from "react-native";

export type AuraGameId = string;

export type AuraGame = {
  id: AuraGameId;
  title: string;
  subtitle: string;
  blurb: string;
  accent: string;
  /** Hero art (remote HTTPS). */
  imageUrl?: string;
  /** Square store icon URL. */
  iconUrl?: string;
  /** Portrait shelf cover URL. */
  coverUrl?: string;
  /** Mini-game entry Aura mounts in a WebView. */
  entryUrl?: string;
};

export const AURA_GAMES: AuraGame[] = [];

export function remoteImage(url?: string): ImageSourcePropType | undefined {
  return url ? { uri: url } : undefined;
}

/** Stack route for WebView Play handoff. */
export function webGameParams(game: AuraGame): { gameId: string; title: string; entryUrl?: string } {
  return { gameId: game.id, title: game.title, entryUrl: game.entryUrl };
}

/** Open a listing. No-op until the listing has an entry URL. */
export function launchGame(navigation: any, game: AuraGame) {
  if (!game.entryUrl) return;
  navigation.navigate("WebGame", webGameParams(game));
}

import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AURA_GAMES, AuraGameId } from "./catalog";

/**
 * Real local play history: a gameId is recorded only when a game actually opens.
 * Newest first, de-duplicated. Nothing here is ever seeded.
 */
const KEY = "aura.recentPlays";
const MAX = 8;
export type RecentPlay = { gameId: AuraGameId; at: number };

let cache: RecentPlay[] | null = null;
const listeners = new Set<(r: RecentPlay[]) => void>();
const known = new Set<string>(AURA_GAMES.map((g) => g.id));

async function load(): Promise<RecentPlay[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentPlay[]) : [];
    cache = parsed.filter((p) => known.has(p.gameId));
  } catch {
    cache = [];
  }
  return cache;
}

export async function recordPlay(gameId: string) {
  if (!known.has(gameId)) return;
  const prev = await load();
  cache = [{ gameId: gameId as AuraGameId, at: Date.now() }, ...prev.filter((p) => p.gameId !== gameId)].slice(0, MAX);
  listeners.forEach((l) => l(cache!));
  AsyncStorage.setItem(KEY, JSON.stringify(cache)).catch(() => {});
}

export function useRecentPlays(): RecentPlay[] {
  const [rows, setRows] = useState<RecentPlay[]>(cache ?? []);
  useEffect(() => {
    let alive = true;
    load().then((r) => alive && setRows(r));
    listeners.add(setRows);
    return () => {
      alive = false;
      listeners.delete(setRows);
    };
  }, []);
  return rows;
}

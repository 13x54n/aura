import React, { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FeaturedHero, HeroSlide } from "../components/store/FeaturedHero";
import { EmptyShelf } from "../components/store/EmptyShelf";
import { StoreShelf } from "../components/store/StoreShelf";
import { GameCover } from "../components/store/GameCover";
import { AURA_GAMES, launchGame, remoteImage } from "../data/catalog";
import { useRecentPlays } from "../data/recentPlays";
import { aura } from "../theme/tokens";

/**
 * Home — featured carousel and shelves from the store catalog.
 * Continue appears only after a listed mini-game has actually opened.
 */
export function HomeScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const recent = useRecentPlays();
  const continueGames = useMemo(
    () => recent.map((r) => AURA_GAMES.find((g) => g.id === r.gameId)).filter((g): g is (typeof AURA_GAMES)[number] => !!g),
    [recent]
  );

  const slides: HeroSlide[] = useMemo(
    () =>
      AURA_GAMES.map((g) => ({
        id: g.id,
        title: g.title,
        blurb: g.blurb,
        imageUrl: g.imageUrl,
        cover: remoteImage(g.coverUrl),
        accent: g.accent,
        onPlay: () => launchGame(navigation, g),
      })),
    [navigation]
  );

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
        {slides.length > 0 ? (
          <FeaturedHero slides={slides} autoMs={4500} />
        ) : (
          <View style={{ paddingTop: insets.top + 52 }}>
            <EmptyShelf
              title="No games yet"
              body="Aura is the store. Mini-games show up here when a listing is published — they are not built in this app."
            />
          </View>
        )}

        {continueGames.length > 0 ? (
          <StoreShelf label="Continue">
            {continueGames.map((g) => (
              <GameCover
                key={g.id}
                title={g.title}
                subtitle={g.subtitle}
                accent={g.accent}
                cover={remoteImage(g.iconUrl)}
                onPress={() => launchGame(navigation, g)}
                width={132}
              />
            ))}
          </StoreShelf>
        ) : null}

        {AURA_GAMES.length > 0 ? (
          <StoreShelf label="Games">
            {AURA_GAMES.map((g) => (
              <GameCover
                key={g.id}
                title={g.title}
                subtitle={g.subtitle}
                accent={g.accent}
                cover={remoteImage(g.iconUrl)}
                onPress={() => launchGame(navigation, g)}
                width={132}
              />
            ))}
          </StoreShelf>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: aura.bg },
  screen: { paddingBottom: 110, paddingTop: 8 },
});

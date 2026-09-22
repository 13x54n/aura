import React, { useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FeaturedHero, HeroSlide } from "../components/store/FeaturedHero";
import { EmptyShelf } from "../components/store/EmptyShelf";
import { StoreShelf } from "../components/store/StoreShelf";
import { GameCover } from "../components/store/GameCover";
import { AURA_GAMES } from "../data/catalog";
import { aura } from "../theme/tokens";

/**
 * Home — carousel of all real titles (Ludo · Chess · Snakes).
 * Continue stays empty until real play history.
 */
export function HomeScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const play = useCallback(
    (gameId: string, title: string) =>
      navigation.navigate("WebGame", { gameId, title }),
    [navigation]
  );

  const slides: HeroSlide[] = useMemo(
    () =>
      AURA_GAMES.map((g) => ({
        id: g.id,
        title: g.title,
        blurb: g.blurb,
        imageUrl: g.imageUrl,
        cover: g.cover,
        accent: g.accent,
        onPlay: () => play(g.id, g.title),
      })),
    [play]
  );

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.screen}
        showsVerticalScrollIndicator={false}
      >
        <View/>

        <FeaturedHero slides={slides} autoMs={4500} />

        <Text style={styles.section} variant="titleMedium">
          Continue Playing
        </Text>
        <EmptyShelf
          title="Nothing in progress"
          body="Games you’ve started show up here. Empty until there’s real play history — no placeholder covers."
        />

        <StoreShelf label="Our games">
          {AURA_GAMES.map((g) => (
            <GameCover
              key={g.id}
              title={g.title}
              subtitle={g.subtitle}
              accent={g.accent}
              cover={g.cover}
              onPress={() => navigation.navigate(g.route)}
              width={132}
            />
          ))}
        </StoreShelf>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: aura.bg },
  screen: { paddingBottom: 110 },
  section: {
    color: aura.text,
    fontWeight: "800",
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 4,
  },
});

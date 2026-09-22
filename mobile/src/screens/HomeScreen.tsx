import React, { useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FeaturedHero, HeroSlide } from "../components/store/FeaturedHero";
import { EmptyShelf } from "../components/store/EmptyShelf";
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

        <EmptyShelf
          title="New Games We Love"
          body="Shelf fills as we deepen Chess and Snakes after the Ludo CLOCK IN path."
        />
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

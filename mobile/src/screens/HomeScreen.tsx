import React, { useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FeaturedHero, HeroSlide } from "../components/store/FeaturedHero";
import { EmptyShelf } from "../components/store/EmptyShelf";
import { aura } from "../theme/tokens";

/**
 * Home — dynamic Ludo hero carousel + empty Continue.
 * Title + Connect live in the thin TopBar (safe-area).
 */
export function HomeScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const playLudo = useCallback(() => navigation.navigate("LudoHub"), [navigation]);

  const slides: HeroSlide[] = useMemo(
    () => [
      {
        id: "ludo-skill",
        title: "Ludo",
        blurb: "Craft skill matches · stake · play",
        accent: "#3B1D6E",
        onPlay: playLudo,
      },
      {
        id: "ludo-escrow",
        title: "Ludo",
        blurb: "On-chain escrow · winner takes the pot",
        accent: "#4C1D95",
        onPlay: playLudo,
      },
      {
        id: "ludo-clockin",
        title: "Ludo",
        blurb: "CLOCK IN demo · create / join / random",
        accent: "#5B21B6",
        onPlay: playLudo,
      },
    ],
    [playLudo]
  );

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.screen,
          // Clear the thin absolute header (safe area + 44)
          { paddingTop: 0 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Spacer so first paint clears floating header when not overscrolling hero */}
        <View style={{ height: insets.top + 8 }} />

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
          body="More real Aura titles land here when they ship."
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

import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { FeaturedHero } from "../components/store/FeaturedHero";
import { StoreShelf } from "../components/store/StoreShelf";
import { GameCover } from "../components/store/GameCover";

/**
 * App Store–style first-party game shelf.
 * Connect lives in the header (TopBar) — not the main story.
 */
export function HomeScreen() {
  const navigation = useNavigation<any>();
  const openLudo = () => navigation.navigate("LudoHub");
  const openComingSoon = () => navigation.navigate("ComingSoon");

  return (
    <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
      <FeaturedHero
        eyebrow="Featured · CLOCK IN"
        title="Ludo"
        blurb="Staked skill matches with on-chain escrow. Create, join, or random — winner takes the pot."
        cta="Get"
        onPress={openLudo}
      />

      <StoreShelf label="Popular Games">
        <GameCover
          title="Ludo"
          subtitle="Skill · SOL escrow"
          badge="LIVE"
          accent="#2D6A4F"
          onPress={openLudo}
        />
        <GameCover
          title="Blitz Dice"
          subtitle="Coming soon"
          accent="#5C4D7A"
          muted
          onPress={openComingSoon}
        />
        <GameCover
          title="Arena Race"
          subtitle="Coming soon"
          accent="#9A3412"
          muted
          onPress={openComingSoon}
        />
      </StoreShelf>

      <StoreShelf label="New & Noteworthy">
        <GameCover
          title="Ludo"
          subtitle="CLOCK IN demo"
          badge="NEW"
          accent="#1D4E89"
          onPress={openLudo}
          width={118}
        />
        <GameCover
          title="Table Rush"
          subtitle="Coming soon"
          accent="#0F766E"
          muted
          onPress={openComingSoon}
          width={118}
        />
        <GameCover
          title="Night Ops"
          subtitle="Coming soon"
          accent="#4C1D95"
          muted
          onPress={openComingSoon}
          width={118}
        />
      </StoreShelf>

      <StoreShelf label="Continue">
        <GameCover
          title="Ludo"
          subtitle="Tap to play"
          accent="#14532D"
          onPress={openLudo}
          width={118}
        />
      </StoreShelf>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 48,
    paddingTop: 4,
  },
});

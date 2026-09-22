import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { FeaturedHero } from "../components/store/FeaturedHero";
import { StoreShelf } from "../components/store/StoreShelf";
import { GameCover } from "../components/store/GameCover";

/**
 * Home — App Store–style, Ludo only (no fake titles).
 * Connect lives in the header. Cover / Play → Ludo hub.
 */
export function HomeScreen() {
  const navigation = useNavigation<any>();
  const playLudo = () => navigation.navigate("LudoHub");

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.screen}
        showsVerticalScrollIndicator={false}
      >
        <FeaturedHero
          eyebrow="Featured · CLOCK IN"
          title="Ludo"
          blurb="Staked skill matches with on-chain escrow. Create, join, or random — winner takes the pot."
          onPress={playLudo}
        />

        <StoreShelf label="Popular">
          <GameCover
            title="Ludo"
            subtitle="Skill · SOL escrow"
            badge="LIVE"
            accent="#2D6A4F"
            onPress={playLudo}
          />
        </StoreShelf>

        <StoreShelf label="Continue">
          <GameCover
            title="Ludo"
            subtitle="Tap to play"
            accent="#14532D"
            onPress={playLudo}
            width={118}
          />
        </StoreShelf>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B1020" },
  screen: { paddingBottom: 96, paddingTop: 4 },
});

import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { FeaturedHero } from "../components/store/FeaturedHero";
import { EmptyShelf } from "../components/store/EmptyShelf";

/**
 * Home — featured real title only. No fake shelf rows.
 * Connect lives in the header. Play → Ludo hub.
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
        <EmptyShelf
          title="Popular"
          body="More Aura titles will show up here when they ship. Arcade has the full real catalog today — Ludo."
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B1020" },
  screen: { paddingBottom: 96, paddingTop: 4 },
});

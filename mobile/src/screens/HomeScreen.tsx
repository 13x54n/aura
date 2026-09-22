import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";

import { FeaturedHero } from "../components/store/FeaturedHero";
import { EmptyShelf } from "../components/store/EmptyShelf";
import { aura } from "../theme/tokens";

/**
 * Home — Arcade hero + honest empty Continue (no fake covers).
 * Connect stays in TopBar. Ludo-only.
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
        <Text style={styles.homeLabel} variant="headlineLarge">
          Home
        </Text>

        <FeaturedHero
          title="Ludo"
          blurb="Craft skill matches · stake · play"
          onPress={playLudo}
          dotCount={5}
        />

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
  screen: { paddingBottom: 110, paddingTop: 4 },
  homeLabel: {
    color: aura.text,
    fontWeight: "800",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  section: {
    color: aura.text,
    fontWeight: "800",
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 4,
  },
});

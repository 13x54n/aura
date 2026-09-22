import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";

import { FeaturedHero } from "../components/store/FeaturedHero";
import { StoreShelf } from "../components/store/StoreShelf";
import { GameCover } from "../components/store/GameCover";
import { EmptyShelf } from "../components/store/EmptyShelf";
import { aura } from "../theme/tokens";

/**
 * Home — Arcade-style full-bleed hero + Continue Playing.
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

        <StoreShelf label="Continue Playing">
          <GameCover
            title="Ludo"
            subtitle="Tap to play"
            accent={aura.ludoAccent}
            onPress={playLudo}
            width={108}
          />
        </StoreShelf>

        <EmptyShelf
          title="New Games We Love"
          body="More real Aura titles land here when they ship — no fake covers."
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
});

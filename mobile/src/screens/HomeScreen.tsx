import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";

import { FeaturedHero } from "../components/store/FeaturedHero";
import { FilterChipRow } from "../components/store/FilterChipRow";
import { GameListRow } from "../components/store/GameListRow";
import { EmptyShelf } from "../components/store/EmptyShelf";
import { aura } from "../theme/tokens";

const CHIPS = [
  { id: "popular", label: "Popular picks" },
  { id: "skill", label: "Skill matches" },
  { id: "new", label: "New on Aura" },
];

export function HomeScreen() {
  const navigation = useNavigation<any>();
  const [chip, setChip] = useState("popular");
  const playLudo = () => navigation.navigate("LudoHub");

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.screen}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headline} variant="headlineMedium">
          Find your perfect game.
        </Text>

        <FilterChipRow chips={CHIPS} activeId={chip} onChange={setChip} />

        <FeaturedHero
          eyebrow="Featured · CLOCK IN"
          title="Ludo"
          blurb="Staked skill matches with on-chain escrow. Create, join, or random — winner takes the pot."
          onPress={playLudo}
        />

        <Text style={styles.section} variant="titleMedium">
          Most popular
        </Text>
        <GameListRow
          title="Ludo"
          subtitle="Skill · SOL escrow · CLOCK IN"
          accent={aura.ludoAccent}
          onPress={playLudo}
        />

        <EmptyShelf
          title="That’s the catalog"
          body="Aura only lists real titles. More shelves fill when the next game ships — no fake rows."
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: aura.bg },
  screen: { paddingBottom: 96, paddingTop: 8 },
  headline: {
    color: aura.text,
    fontWeight: "800",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  section: {
    color: aura.text,
    fontWeight: "800",
    paddingHorizontal: 16,
    marginTop: 22,
    marginBottom: 10,
  },
});

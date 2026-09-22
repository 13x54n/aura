import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StoreShelf } from "../components/store/StoreShelf";
import { GameCover } from "../components/store/GameCover";
import { FilterChipRow } from "../components/store/FilterChipRow";
import { AURA_GAMES } from "../data/catalog";
import { aura } from "../theme/tokens";

const CHIPS = [
  { id: "latest", label: "Latest" },
  { id: "skill", label: "Skill escrow" },
  { id: "live", label: "Live now" },
];

export function ArcadeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [chip, setChip] = useState("latest");

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.screen, { paddingTop: insets.top + 52 }]}
      >
        <Text style={styles.heading} variant="headlineSmall">
          Arcade
        </Text>
        <FilterChipRow chips={CHIPS} activeId={chip} onChange={setChip} />
        <StoreShelf label="All games">
          {AURA_GAMES.map((g) => (
            <GameCover
              key={g.id}
              title={g.title}
              subtitle={g.depth === "deep" ? "CLOCK IN deep" : "Playable"}
              badge={g.depth === "deep" ? "LIVE" : "NEW"}
              accent={g.accent}
              onPress={() => navigation.navigate(g.route)}
              width={148}
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
  heading: {
    fontWeight: "800",
    color: aura.text,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
});

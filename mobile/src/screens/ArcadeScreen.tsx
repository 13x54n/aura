import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { StoreShelf } from "../components/store/StoreShelf";
import { GameCover } from "../components/store/GameCover";
import { EmptyShelf } from "../components/store/EmptyShelf";
import { FilterChipRow } from "../components/store/FilterChipRow";
import { aura } from "../theme/tokens";

const CHIPS = [
  { id: "latest", label: "Latest" },
  { id: "skill", label: "Skill escrow" },
  { id: "live", label: "Live now" },
];

export function ArcadeScreen() {
  const navigation = useNavigation<any>();
  const [chip, setChip] = useState("latest");
  const playLudo = () => navigation.navigate("LudoHub");

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.screen}>
        <Text style={styles.heading} variant="headlineSmall">
          Arcade
        </Text>
        <FilterChipRow chips={CHIPS} activeId={chip} onChange={setChip} />
        <StoreShelf label="Brand new adventures">
          <GameCover
            title="Ludo"
            subtitle="Play now"
            badge="LIVE"
            accent={aura.ludoAccent}
            onPress={playLudo}
            width={148}
          />
        </StoreShelf>
        <EmptyShelf
          title="More games soon"
          body="Only real Aura titles show here. When the next one ships, it lands on this shelf."
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: aura.bg },
  screen: { paddingBottom: 96, paddingTop: 8 },
  heading: {
    fontWeight: "800",
    color: aura.text,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
});

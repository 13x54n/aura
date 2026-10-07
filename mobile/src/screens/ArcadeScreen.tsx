import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StoreShelf } from "../components/store/StoreShelf";
import { GameCover } from "../components/store/GameCover";
import { FilterChipRow } from "../components/store/FilterChipRow";
import { EmptyShelf } from "../components/store/EmptyShelf";
import { AURA_GAMES, launchGame, remoteImage } from "../data/catalog";
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
      <ScrollView contentContainerStyle={[styles.screen, { paddingTop: insets.top + 52 }]}>
        <FilterChipRow chips={CHIPS} activeId={chip} onChange={setChip} />
        {AURA_GAMES.length === 0 ? (
          <EmptyShelf
            title="No games yet"
            body="The catalog is empty. Mini-games are loaded from a URL when a listing is published."
          />
        ) : (
          <StoreShelf label="All games">
            {AURA_GAMES.map((g) => (
              <GameCover
                key={g.id}
                title={g.title}
                subtitle={g.subtitle}
                accent={g.accent}
                cover={remoteImage(g.coverUrl)}
                onPress={() => launchGame(navigation, g)}
                width={148}
              />
            ))}
          </StoreShelf>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: aura.bg },
  screen: { paddingBottom: 110 },
});

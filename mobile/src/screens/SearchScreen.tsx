import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Searchbar, Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GameListRow } from "../components/store/GameListRow";
import { EmptyShelf } from "../components/store/EmptyShelf";
import { GlassPanel } from "../components/store/GlassPanel";
import { AURA_GAMES, launchGame, remoteImage } from "../data/catalog";
import { aura } from "../theme/tokens";

export function SearchScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return AURA_GAMES;
    return AURA_GAMES.filter(
      (g) => g.title.toLowerCase().includes(q) || g.subtitle.toLowerCase().includes(q)
    );
  }, [query]);

  const q = query.trim();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 52 }]}>
      <Text style={styles.heading} variant="headlineSmall">
        Search
      </Text>
      <GlassPanel style={styles.searchGlass} intensity={55}>
        <Searchbar
          placeholder="Search Aura games"
          value={query}
          onChangeText={setQuery}
          style={styles.search}
          inputStyle={{ color: aura.text }}
          iconColor={aura.textMuted}
          placeholderTextColor={aura.textDim}
        />
      </GlassPanel>
      {results.length === 0 ? (
        <EmptyShelf
          title={q ? "No matches" : "No games yet"}
          body={
            q
              ? `Nothing named “${q}” in the catalog.`
              : "Mini-games will appear here when they are published."
          }
        />
      ) : (
        results.map((g) => (
          <GameListRow
            key={g.id}
            title={g.title}
            subtitle={g.subtitle}
            accent={g.accent}
            icon={remoteImage(g.iconUrl)}
            onPress={() => launchGame(navigation, g)}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: aura.bg },
  heading: {
    fontWeight: "800",
    color: aura.text,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchGlass: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16 },
  search: { backgroundColor: "transparent", elevation: 0 },
});

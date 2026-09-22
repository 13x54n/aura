import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Searchbar, Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { GameListRow } from "../components/store/GameListRow";
import { EmptyShelf } from "../components/store/EmptyShelf";
import { GlassPanel } from "../components/store/GlassPanel";
import { aura } from "../theme/tokens";

const CATALOG = [
  {
    id: "ludo",
    title: "Ludo",
    subtitle: "Skill · SOL escrow",
    accent: aura.ludoAccent,
    route: "LudoHub" as const,
  },
];

export function SearchScreen() {
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATALOG;
    return CATALOG.filter((g) => g.title.toLowerCase().includes(q));
  }, [query]);

  return (
    <View style={styles.root}>
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
          title="No matches"
          body={`Nothing named “${query.trim()}” yet. Today the real catalog is just Ludo.`}
        />
      ) : (
        results.map((g) => (
          <GameListRow
            key={g.id}
            title={g.title}
            subtitle={g.subtitle}
            accent={g.accent}
            onPress={() => navigation.navigate(g.route)}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: aura.bg, paddingTop: 8 },
  heading: {
    fontWeight: "800",
    color: aura.text,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchGlass: {
    marginHorizontal: 16,
    borderRadius: 18,
    marginBottom: 16,
  },
  search: { backgroundColor: "transparent", elevation: 0 },
});

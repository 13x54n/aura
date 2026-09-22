import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Searchbar, Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { GameCover } from "../components/store/GameCover";
import { EmptyShelf } from "../components/store/EmptyShelf";
import { GlassPanel } from "../components/store/GlassPanel";

const CATALOG = [
  {
    id: "ludo",
    title: "Ludo",
    subtitle: "Skill · SOL escrow",
    accent: "#2D6A4F",
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
      <GlassPanel style={styles.searchGlass} intensity={50}>
        <Searchbar
          placeholder="Search Aura games"
          value={query}
          onChangeText={setQuery}
          style={styles.search}
          inputStyle={{ color: "#fff" }}
          iconColor="rgba(255,255,255,0.7)"
          placeholderTextColor="rgba(255,255,255,0.45)"
        />
      </GlassPanel>
      {results.length === 0 ? (
        <EmptyShelf
          title="No matches"
          body={`Nothing named “${query.trim()}” yet. Aura only lists real games — today that's Ludo.`}
        />
      ) : (
        <View style={styles.results}>
          {results.map((g) => (
            <GameCover
              key={g.id}
              title={g.title}
              subtitle={g.subtitle}
              accent={g.accent}
              onPress={() => navigation.navigate(g.route)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B1020", paddingTop: 8 },
  heading: {
    fontWeight: "800",
    color: "#fff",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchGlass: {
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  search: {
    backgroundColor: "transparent",
    elevation: 0,
  },
  results: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
  },
});

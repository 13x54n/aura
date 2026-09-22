import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GameListRow } from "../components/store/GameListRow";
import { AURA_GAMES } from "../data/catalog";
import { aura } from "../theme/tokens";

export function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.screen, { paddingTop: insets.top + 52 }]}
      >
        <Text style={styles.heading} variant="headlineSmall">
          Library
        </Text>
        <Text style={styles.section} variant="titleMedium">
          Your games
        </Text>
        {AURA_GAMES.map((g) => (
          <GameListRow
            key={g.id}
            title={g.title}
            subtitle={g.subtitle}
            accent={g.accent}
            onPress={() => navigation.navigate("WebGame", { gameId: g.id, title: g.title })}
          />
        ))}
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
    marginBottom: 8,
  },
  section: {
    color: aura.text,
    fontWeight: "800",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
});

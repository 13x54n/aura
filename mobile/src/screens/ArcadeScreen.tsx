import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { StoreShelf } from "../components/store/StoreShelf";
import { GameCover } from "../components/store/GameCover";
import { EmptyShelf } from "../components/store/EmptyShelf";

/** Arcade — all playable first-party games (Ludo only for now). */
export function ArcadeScreen() {
  const navigation = useNavigation<any>();
  const playLudo = () => navigation.navigate("LudoHub");

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.screen}>
        <Text style={styles.heading} variant="headlineSmall">
          Arcade
        </Text>
        <StoreShelf label="All games">
          <GameCover
            title="Ludo"
            subtitle="Play now"
            badge="LIVE"
            accent="#2D6A4F"
            onPress={playLudo}
          />
        </StoreShelf>
        <EmptyShelf
          title="More games soon"
          body="Aura only lists real titles. When the next game ships, it shows up here — no placeholders."
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B1020" },
  screen: { paddingBottom: 96, paddingTop: 8 },
  heading: {
    fontWeight: "800",
    color: "#fff",
    paddingHorizontal: 16,
    marginBottom: 4,
  },
});

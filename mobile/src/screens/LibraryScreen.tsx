import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { StoreShelf } from "../components/store/StoreShelf";
import { GameCover } from "../components/store/GameCover";
import { EmptyShelf } from "../components/store/EmptyShelf";

/** Library — games you've opened. Ludo once you've played; honest empty otherwise. */
export function LibraryScreen() {
  const navigation = useNavigation<any>();
  // Until we persist play history, show Ludo as the only owned/playable title.
  const playLudo = () => navigation.navigate("LudoHub");

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.screen}>
        <Text style={styles.heading} variant="headlineSmall">
          Library
        </Text>
        <StoreShelf label="Your games">
          <GameCover
            title="Ludo"
            subtitle="Ready to play"
            accent="#1D4E89"
            onPress={playLudo}
          />
        </StoreShelf>
        <EmptyShelf
          title="That's everything"
          body="Only real Aura titles appear here. No stubs, no coming-soon covers."
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

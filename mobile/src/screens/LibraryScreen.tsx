import { useSafeAreaInsets } from "react-native-safe-area-context";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { GameListRow } from "../components/store/GameListRow";
import { EmptyShelf } from "../components/store/EmptyShelf";
import { aura } from "../theme/tokens";

export function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const playLudo = () => navigation.navigate("LudoHub");

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.screen, { paddingTop: insets.top + 52 }]}>
        <Text style={styles.heading} variant="headlineSmall">
          Library
        </Text>
        <Text style={styles.section} variant="titleMedium">
          Your games
        </Text>
        <GameListRow
          title="Ludo"
          subtitle="Ready to play"
          accent={aura.ludoAccent}
          onPress={playLudo}
        />
        <EmptyShelf
          title="That’s everything"
          body="Only real Aura titles appear here. No stubs."
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: aura.bg },
  screen: { paddingBottom: 110, paddingTop: 56 },
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

import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";

export function RandomMatchScreen() {
  const navigation = useNavigation<any>();
  const [searching, setSearching] = useState(false);

  const findMatch = () => {
    setSearching(true);
    // Stub matchmaking — pretend we found a room after a short delay.
    setTimeout(() => {
      setSearching(false);
      navigation.navigate("Escrow", {
        mode: "random",
        roomCode: "rnd-" + Math.random().toString(36).slice(2, 8),
      });
    }, 900);
  };

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>
        Random match
      </Text>
      <Text variant="bodyMedium" style={styles.blurb}>
        Stub matchmaking server. Finds a placeholder room, then skill-match
        escrow.
      </Text>
      {searching ? (
        <View style={styles.searching}>
          <ActivityIndicator />
          <Text style={{ marginTop: 12 }}>Looking for opponents…</Text>
        </View>
      ) : (
        <Button mode="contained" icon="magnify" onPress={findMatch}>
          Find match
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8 },
  title: { fontWeight: "800" },
  blurb: { opacity: 0.75, marginBottom: 16 },
  searching: { alignItems: "center", marginTop: 24 },
});

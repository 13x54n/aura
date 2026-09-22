import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Text, Card } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";

/** Ludo lobby — room stubs only; matchmaking server later. */
export function LudoHubScreen() {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>
        Ludo
      </Text>
      <Text variant="bodyMedium" style={styles.blurb}>
        Free Play opens the WebView board. Create / Join / Random go through
        host escrow (stake before mount), then the same WebView. Wallet +
        payout stay on the host — not in the board.
      </Text>

      <Card style={styles.card} mode="outlined">
        <Card.Content style={styles.actions}>
          <Button
            mode="contained"
            icon="play"
            onPress={() =>
              navigation.navigate("WebGame", { gameId: "ludo", title: "Ludo" })
            }
          >
            Play
          </Button>
          <Button
            mode="outlined"
            icon="plus-box"
            onPress={() => navigation.navigate("LudoCreateRoom")}
          >
            Create room
          </Button>
          <Button
            mode="outlined"
            icon="login"
            onPress={() => navigation.navigate("LudoJoinRoom")}
          >
            Join room
          </Button>
          <Button
            mode="outlined"
            icon="dice-5"
            onPress={() => navigation.navigate("LudoRandomMatch")}
          >
            Random match
          </Button>
        </Card.Content>
      </Card>

      <Text variant="bodySmall" style={styles.note}>
        Escrow + Seed Vault on host (by Sep 30). Match authority is the host
        Free Play mounts games/ludo (real board). Rooms still gate escrow on the host.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontWeight: "800", marginBottom: 8 },
  blurb: { opacity: 0.75, marginBottom: 16 },
  card: { marginBottom: 16 },
  actions: { gap: 12 },
  note: { opacity: 0.6 },
});

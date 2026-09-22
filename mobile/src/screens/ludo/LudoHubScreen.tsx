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
        Skill match with Solana escrow. Stake in → play → winner payout. Not
        gambling UI — skill + escrow.
      </Text>

      <Card style={styles.card} mode="outlined">
        <Card.Content style={styles.actions}>
          <Button
            mode="contained"
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
        Wedge: Seed Vault one-tap via MWA · SGT one-device/one-account later ·
        commit-reveal / VRF dice later.
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

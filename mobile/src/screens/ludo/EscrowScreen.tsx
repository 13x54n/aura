import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Text, TextInput, HelperText, Divider } from "react-native-paper";
import { RouteProp, useRoute } from "@react-navigation/native";
import { alertAndLog } from "../../utils/alertAndLog";

type EscrowParams = {
  Escrow: {
    mode: "create" | "join" | "random";
    roomCode: string;
  };
};

/**
 * Skill-match escrow stub — PDA / tx buttons are placeholders.
 * Framing: skill + escrow, NOT casino/gambling.
 */
export function EscrowScreen() {
  const route = useRoute<RouteProp<EscrowParams, "Escrow">>();
  const { mode, roomCode } = route.params;
  const [stake, setStake] = useState("0.1");

  const stub = (label: string) => {
    alertAndLog(
      "Escrow stub",
      `${label} — PDA/tx wiring lands in a later milestone. Room ${roomCode}, stake ${stake} SOL (${mode}).`
    );
  };

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>
        Skill match escrow
      </Text>
      <Text variant="bodyMedium" style={styles.blurb}>
        Both players lock the same stake into a Solana escrow PDA. Winner
        receives the pot after a verified skill match. This is escrow for a
        skill game — not a casino, prediction market, or house edge.
      </Text>

      <Text variant="labelLarge">Room · {roomCode}</Text>
      <Text variant="labelLarge" style={{ marginBottom: 8 }}>
        Mode · {mode}
      </Text>

      <TextInput
        label="Stake amount (SOL)"
        value={stake}
        onChangeText={setStake}
        keyboardType="decimal-pad"
        mode="outlined"
      />
      <HelperText type="info">
        Demo amounts only. Real PDA deposit/withdraw comes next.
      </HelperText>

      <Divider style={{ marginVertical: 12 }} />

      <Button mode="contained" onPress={() => stub("Derive escrow PDA")}>
        Derive escrow PDA (stub)
      </Button>
      <Button
        mode="outlined"
        style={{ marginTop: 8 }}
        onPress={() => stub("Deposit stake tx")}
      >
        Deposit stake (stub tx)
      </Button>
      <Button
        mode="outlined"
        style={{ marginTop: 8 }}
        onPress={() => stub("Winner payout tx")}
      >
        Winner payout (stub tx)
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 4 },
  title: { fontWeight: "800", marginBottom: 4 },
  blurb: { opacity: 0.75, marginBottom: 12 },
});

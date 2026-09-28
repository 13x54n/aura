import React, { useMemo, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { aura } from "../../theme/tokens";
import { Glass, Label, LudoScreen, Muted, PrimaryButton, SummaryRow } from "./ludoUi";
import { payoutFor } from "./ludoMock";

/** Join by code (wireframe 3): 6-char code → table card → reserve seat. */
export function JoinRoomScreen() {
  const navigation = useNavigation<any>();
  const [code, setCode] = useState("");
  const valid = code.length === 6;
  // Mock table lookup until the rooms backend exists.
  const table = useMemo(() => (valid ? { host: "Maya", players: 4, seated: 2, stake: 5 } : null), [valid]);

  return (
    <LudoScreen
      title="Join by code"
      toHub
      footer={
        <PrimaryButton
          icon="seat"
          label="Join table · Reserve"
          disabled={!table}
          onPress={() =>
            navigation.navigate("LudoLobby", {
              mode: "join",
              roomCode: code,
              players: table!.players,
              stake: table!.stake,
              visibility: "Private",
            })
          }
        />
      }
    >
      <Glass style={{ gap: 10 }}>
        <Label>Table code</Label>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          placeholder="ABC123"
          placeholderTextColor={aura.textDim}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={styles.code}
        />
        <Muted>Ask the host for their 6-character code.</Muted>
      </Glass>
      {table ? (
        <Glass>
          <View style={styles.head}>
            <Text style={styles.title}>{table.host}'s table</Text>
            <Text style={styles.badge}>{code}</Text>
          </View>
          <SummaryRow k="Seats" v={`${table.seated}/${table.players} filled`} />
          <SummaryRow k="Stake per player" v={`${table.stake} USDC`} />
          <SummaryRow k="Winner takes" v={`${payoutFor(table.stake, table.players).payout} USDC`} strong />
        </Glass>
      ) : null}
      {table ? <Muted style={{ fontSize: 11, textAlign: "center" }}>Example table until rooms go live.</Muted> : null}
    </LudoScreen>
  );
}

const styles = StyleSheet.create({
  code: {
    color: aura.text,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 10,
    textAlign: "center",
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: aura.chipIdle,
  },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  title: { color: aura.text, fontSize: 17, fontWeight: "800" },
  badge: { color: aura.purpleBright, fontWeight: "800", letterSpacing: 2 },
});

import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import * as Clipboard from "expo-clipboard";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { aura } from "../../theme/tokens";
import { Glass, Label, LudoScreen, Muted, PrimaryButton, SeatGrid, SummaryRow } from "./ludoUi";
import { mockSeats, payoutFor } from "./ludoMock";

export type LudoLobbyParams = {
  mode: "create" | "join" | "random";
  roomCode: string;
  players: number;
  stake: number;
  visibility?: string;
};

/** Pre-game lobby (wireframe 5): invite code · 2×2 seats · Ready · Reserve. */
export function LudoLobbyScreen() {
  const navigation = useNavigation<any>();
  const { mode, roomCode, players, stake } = useRoute<any>().params as LudoLobbyParams;
  const [seats, setSeats] = useState(() => mockSeats(players));
  const [copied, setCopied] = useState(false);
  const allReady = seats.every((x) => x.ready);

  // Mock: last open seat readies up shortly after joining.
  useEffect(() => {
    const t = setTimeout(
      () => setSeats((prev) => prev.map((x, i) => (i === prev.length - 1 ? { ...x, ready: true } : x))),
      1800
    );
    return () => clearTimeout(t);
  }, []);

  const youReady = seats[0]?.ready;

  const onReady = () => {
    if (!youReady) {
      setSeats((prev) => prev.map((x, i) => (i === 0 ? { ...x, ready: true } : x)));
      return;
    }
    // Stake is locked by the host escrow gate before the board mounts.
    navigation.replace("Escrow", { mode, roomCode, stake: String(stake), players });
  };

  return (
    <LudoScreen
      title="Lobby"
      toHub
      footer={
        <PrimaryButton
          icon={youReady ? "lock" : "check"}
          label={!youReady ? "Ready · Reserve" : allReady ? "Lock stake & start" : "Waiting for players…"}
          disabled={youReady && !allReady}
          onPress={onReady}
        />
      }
    >
      {mode !== "random" ? (
        <Glass>
          <Label>Invite code</Label>
          <View style={styles.codeRow}>
            <Text style={styles.code}>{roomCode}</Text>
            <Pressable
              hitSlop={8}
              onPress={async () => {
                await Clipboard.setStringAsync(roomCode);
                setCopied(true);
              }}
              style={styles.copy}
            >
              <Icon name={copied ? "check" : "content-copy"} size={18} color={aura.purpleBright} />
              <Text style={styles.copyText}>{copied ? "Copied" : "Copy"}</Text>
            </Pressable>
          </View>
        </Glass>
      ) : null}

      <Label>Players · {seats.filter((x) => x.ready).length}/{players} ready</Label>
      <SeatGrid seats={seats} total={players <= 2 ? 2 : 4} />

      <Glass>
        <SummaryRow k="Stake per player" v={`${stake} USDC`} />
        <SummaryRow k="Winner takes" v={`${payoutFor(stake, players).payout} USDC`} strong />
      </Glass>
      <Muted style={{ fontSize: 11, textAlign: "center" }}>Other players are example data until rooms go live.</Muted>
    </LudoScreen>
  );
}

const styles = StyleSheet.create({
  codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  code: { color: aura.text, fontSize: 28, fontWeight: "800", letterSpacing: 6 },
  copy: { flexDirection: "row", alignItems: "center", gap: 6 },
  copyText: { color: aura.purpleBright, fontWeight: "700" },
});

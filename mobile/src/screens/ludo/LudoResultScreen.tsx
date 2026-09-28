import React from "react";
import { Share, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { aura } from "../../theme/tokens";
import { Big, GhostButton, Glass, Label, LudoScreen, Muted, PrimaryButton, SummaryRow } from "./ludoUi";
import { payoutFor, SEAT_COLORS } from "./ludoMock";

export type LudoResultParams = {
  won: boolean;
  winnerName?: string;
  roomCode?: string;
  stake?: number;
  players?: number;
  standings?: string[];
};

/** Winner / payout (wireframe 7): result · receipt · standings · Share / Play again. */
export function LudoResultScreen() {
  const navigation = useNavigation<any>();
  const p = (useRoute<any>().params ?? {}) as LudoResultParams;
  const stake = p.stake ?? 0;
  const players = p.players ?? 4;
  const { pot, fee, payout } = payoutFor(stake, players);
  const standings = p.standings ?? (p.won ? ["You", "Maya", "Kofi", "Iris"] : [p.winnerName ?? "Maya", "You", "Kofi", "Iris"]).slice(0, players);

  return (
    <LudoScreen
      title="Result"
      footer={
        <>
          <PrimaryButton icon="replay" label="Play again" onPress={() => navigation.replace("LudoRandomMatch")} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <GhostButton
                label="Share"
                onPress={() =>
                  Share.share({
                    message: p.won ? `I just won ${payout} USDC in Ludo on Aura 🎲` : `Just played Ludo on Aura 🎲`,
                  }).catch(() => {})
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <GhostButton label="Back to hub" onPress={() => navigation.navigate("LudoHub")} />
            </View>
          </View>
        </>
      }
    >
      <Glass style={styles.hero}>
        <Icon name={p.won ? "trophy" : "dice-multiple"} size={48} color={p.won ? "#FACC15" : aura.purpleBright} />
        <Big>{p.won ? "You win!" : `${p.winnerName ?? "Opponent"} wins`}</Big>
        {stake > 0 ? (
          <Text style={[styles.amount, { color: p.won ? "#34D399" : "#F87171" }]}>
            {p.won ? `+${payout}` : `-${stake}`} USDC
          </Text>
        ) : (
          <Muted>Free Play · no stake</Muted>
        )}
      </Glass>

      {stake > 0 ? (
        <Glass>
          <Label>Receipt{p.roomCode ? ` · ${p.roomCode}` : ""}</Label>
          <SummaryRow k="Pot" v={`${pot} USDC`} />
          <SummaryRow k="House fee (5%)" v={`${fee} USDC`} />
          <SummaryRow k="Paid to winner" v={`${payout} USDC`} strong />
          <Muted style={{ fontSize: 11, marginTop: 6 }}>Released by host escrow from the attested result.</Muted>
        </Glass>
      ) : null}

      <Glass>
        <Label>Standings</Label>
        {standings.map((name, i) => (
          <View key={name + i} style={styles.stand}>
            <Text style={styles.rank}>{i + 1}</Text>
            <View style={[styles.dot, { backgroundColor: SEAT_COLORS[i % 4] }]} />
            <Text style={[styles.name, name === "You" && { color: aura.purpleBright }]}>{name}</Text>
          </View>
        ))}
      </Glass>
    </LudoScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 8, paddingVertical: 28 },
  amount: { fontSize: 22, fontWeight: "800" },
  stand: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  rank: { color: aura.textDim, width: 16, fontWeight: "800" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { color: aura.text, fontWeight: "700" },
});

import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { aura } from "../../theme/tokens";
import { ActionTile, Glass, Label, LudoScreen, Muted } from "./ludoUi";
import { BalanceCard } from "./BalanceCard";
import { MOCK_LEDGER } from "./ludoMock";

/**
 * Ludo home (wireframe 1). One glass screen — no second tab bar inside Ludo:
 * host USDC balance · Create / Join / Quick · Recent strip → Wallet/history.
 */
export function LudoHubScreen() {
  const navigation = useNavigation<any>();

  return (
    <LudoScreen>
      <BalanceCard />

      <ActionTile
        icon="play-circle"
        title="Free Play"
        sub="Practice vs bots · no stake"
        onPress={() => navigation.navigate("WebGame", { gameId: "ludo", title: "Ludo" })}
      />
      <ActionTile icon="plus-box" title="Create private" sub="Set players + stake, share a code" onPress={() => navigation.navigate("LudoCreateRoom")} />
      <ActionTile icon="key-variant" title="Join with code" sub="Enter a 6-character table code" onPress={() => navigation.navigate("LudoJoinRoom")} />
      <ActionTile icon="lightning-bolt" title="Quick match" sub="Pick a stake, get seated fast" onPress={() => navigation.navigate("LudoRandomMatch")} />

      <View style={styles.recentHead}>
        <Label>Recent matches</Label>
        <Pressable onPress={() => navigation.navigate("HomeStack", { screen: "Wallet" })} hitSlop={8}>
          <Text style={styles.link}>Wallet & history</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {MOCK_LEDGER.map((m) => (
          <Pressable key={m.id} onPress={() => navigation.navigate("HomeStack", { screen: "Wallet" })}>
            <Glass style={styles.recent}>
              <Text style={[styles.delta, { color: m.delta >= 0 ? "#34D399" : "#F87171" }]}>
                {m.delta >= 0 ? "+" : ""}
                {m.delta.toFixed(2)}
              </Text>
              <Muted>{m.players}P · {m.stake} USDC</Muted>
              <Muted style={{ fontSize: 11 }}>{m.when}</Muted>
            </Glass>
          </Pressable>
        ))}
      </ScrollView>
      <Muted style={{ fontSize: 11, textAlign: "center" }}>Recent matches are example data until rooms go live.</Muted>
    </LudoScreen>
  );
}

const styles = StyleSheet.create({
  recentHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  link: { color: aura.purpleBright, fontWeight: "700" },
  recent: { width: 132, gap: 2, padding: 14 },
  delta: { fontSize: 18, fontWeight: "800" },
});

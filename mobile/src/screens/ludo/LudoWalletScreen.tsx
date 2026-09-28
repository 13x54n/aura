import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { aura } from "../../theme/tokens";
import { Glass, Label, LudoScreen, Muted } from "./ludoUi";
import { BalanceCard } from "./BalanceCard";
import { MOCK_LEDGER } from "./ludoMock";

/** Wallet / history (wireframe 8): host USDC balance + match ledger. Host-only. */
export function LudoWalletScreen() {
  const net = MOCK_LEDGER.reduce((a, m) => a + m.delta, 0);

  return (
    <LudoScreen title="Wallet" toHub>
      <BalanceCard />

      <View style={styles.head}>
        <Label>Match history</Label>
        <Text style={[styles.net, { color: net >= 0 ? "#34D399" : "#F87171" }]}>
          Net {net >= 0 ? "+" : ""}
          {net.toFixed(2)}
        </Text>
      </View>
      <Glass style={{ paddingVertical: 4 }}>
        {MOCK_LEDGER.map((m, i) => (
          <View key={m.id} style={[styles.row, i > 0 && styles.divider]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {m.result === "won" ? "Won" : "Lost"} · {m.players}P table
              </Text>
              <Muted style={{ fontSize: 12 }}>
                {m.code} · {m.stake} USDC stake · {m.when}
              </Muted>
            </View>
            <Text style={[styles.delta, { color: m.delta >= 0 ? "#34D399" : "#F87171" }]}>
              {m.delta >= 0 ? "+" : ""}
              {m.delta.toFixed(2)}
            </Text>
          </View>
        ))}
      </Glass>
      <Muted style={{ fontSize: 11, textAlign: "center" }}>History is example data until rooms go live.</Muted>
    </LudoScreen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  net: { fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: aura.glassBorder },
  title: { color: aura.text, fontWeight: "700" },
  delta: { fontWeight: "800", fontSize: 16 },
});

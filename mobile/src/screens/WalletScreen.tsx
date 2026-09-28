import React from "react";
import { Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import * as Clipboard from "expo-clipboard";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { aura } from "../theme/tokens";
import { useMobileWallet } from "../utils/useMobileWallet";
import { useHostBalances } from "../wallet/useHostBalances";
import { Big, GhostButton, Glass, Label, Muted, PrimaryButton } from "./ludo/ludoUi";
import { MOCK_ALL_GAMES_LEDGER } from "./ludo/ludoMock";

const fmt = (v: number | null, dp: number, connected: boolean, loading: boolean) =>
  !connected ? "—" : loading && v == null ? "…" : v == null ? "—" : v.toFixed(dp);

/** Host Wallet tab (replaces Library). Wallet UI is host-only — games never render this. */
export function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { connect } = useMobileWallet();
  const b = useHostBalances();
  const net = MOCK_ALL_GAMES_LEDGER.reduce((a, m) => a + m.delta, 0);

  const copy = async () => {
    if (!b.address) return;
    await Clipboard.setStringAsync(b.address);
    Alert.alert("Copied", "Wallet address copied.");
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.screen, { paddingTop: insets.top + 56 }]}
        refreshControl={<RefreshControl refreshing={b.loading} onRefresh={b.refresh} tintColor={aura.text} />}
      >
        <Glass>
          <Label>USDC balance · host wallet</Label>
          <View style={styles.bigRow}>
            <Big>{fmt(b.usdc, 2, b.connected, b.loading)}</Big>
            <Text style={styles.unit}>USDC</Text>
          </View>
          <View style={styles.subRow}>
            <View style={styles.pill}>
              <Text style={styles.pillK}>SOL</Text>
              <Text style={styles.pillV}>{fmt(b.sol, 3, b.connected, b.loading)}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillK}>SKR</Text>
              <Text style={styles.pillV}>{b.skrConfigured ? fmt(b.skr, 2, b.connected, b.loading) : "—"}</Text>
            </View>
          </View>

          {b.address ? (
            <Pressable onPress={copy} style={styles.addr} hitSlop={6}>
              <Text style={styles.addrText} numberOfLines={1}>
                {b.address.slice(0, 6)}…{b.address.slice(-6)}
              </Text>
              <Icon name="content-copy" size={16} color={aura.textMuted} />
            </Pressable>
          ) : (
            <Muted style={{ marginTop: 8 }}>Connect your wallet to see balances.</Muted>
          )}

          <View style={styles.actions}>
            {b.connected ? (
              <>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    label="Add funds"
                    onPress={async () => {
                      await Clipboard.setStringAsync(b.address!);
                      Alert.alert(
                        "Add USDC",
                        `Your wallet address is copied. Send devnet USDC to:\n\n${b.address}\n\nPull down to refresh once it lands.`
                      );
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <GhostButton
                    label="Withdraw"
                    onPress={() =>
                      Alert.alert(
                        "Withdraw",
                        "Your USDC already sits in your own wallet. Withdrawing winnings from escrow goes live with staked rooms."
                      )
                    }
                  />
                </View>
              </>
            ) : (
              <View style={{ flex: 1 }}>
                <PrimaryButton label="Connect wallet" onPress={() => connect().catch(() => {})} />
              </View>
            )}
          </View>
          {!b.skrConfigured ? <Muted style={styles.fine}>SKR shows once its mint is set for this network.</Muted> : null}
        </Glass>

        <View style={styles.head}>
          <Label>Match history · all games</Label>
          <Text style={[styles.net, { color: net >= 0 ? "#34D399" : "#F87171" }]}>
            Net {net >= 0 ? "+" : ""}
            {net.toFixed(2)}
          </Text>
        </View>
        <Glass style={{ paddingVertical: 4 }}>
          {MOCK_ALL_GAMES_LEDGER.map((m, i) => (
            <View key={m.id} style={[styles.row, i > 0 && styles.divider]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  {m.game} · {m.result === "won" ? "Won" : "Lost"} · {m.players}P
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
        <View style={styles.tag}>
          <Text style={styles.tagText}>EXAMPLE DATA · history goes live with staked rooms</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: aura.bg },
  screen: { paddingHorizontal: 16, paddingBottom: 120, gap: 12 },
  bigRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginVertical: 6 },
  unit: { color: aura.textMuted, fontWeight: "700", marginBottom: 6 },
  subRow: { flexDirection: "row", gap: 8 },
  pill: {
    flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: aura.glassBorder,
  },
  pillK: { color: aura.textMuted, fontWeight: "700", fontSize: 12 },
  pillV: { color: aura.text, fontWeight: "800" },
  addr: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  addrText: { color: aura.text, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 13 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  fine: { fontSize: 11, marginTop: 10 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  net: { fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: aura.glassBorder },
  title: { color: aura.text, fontWeight: "700" },
  delta: { fontWeight: "800", fontSize: 16 },
  tag: { alignSelf: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)" },
  tagText: { color: aura.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
});

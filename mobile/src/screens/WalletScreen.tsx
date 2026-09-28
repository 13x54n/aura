import React, { useMemo, useRef, useState } from "react";
import {
  Alert, Animated, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View,
} from "react-native";
import { Text } from "react-native-paper";
import * as Clipboard from "expo-clipboard";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { aura } from "../theme/tokens";
import { useMobileWallet } from "../utils/useMobileWallet";
import { useHostBalances } from "../wallet/useHostBalances";
import { AURA_GAMES } from "../data/catalog";
import { Big, Glass, Label, Muted, PrimaryButton } from "./ludo/ludoUi";
import { LedgerRow, MOCK_ALL_GAMES_LEDGER } from "./ludo/ludoMock";

/** Withdraw from escrow ships with staked rooms; until then it's dimmed and explains. */
const STAKED_ROOMS_LIVE = false;
const FILTERS = ["All", "Ludo", "Chess", "Snakes"] as const;
type Filter = (typeof FILTERS)[number];

const ICON_BY_GAME: Record<string, any> = Object.fromEntries(
  AURA_GAMES.map((g) => [g.title.toLowerCase().startsWith("snakes") ? "Snakes" : g.title, g.icon])
);

const num = (v: number | null, dp: number, loading: boolean) =>
  loading && v == null ? "…" : v == null ? "—" : v.toFixed(dp);

/** Host Wallet tab (replaces Library). Wallet UI is host-only — games never render this. */
export function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { connect } = useMobileWallet();
  const b = useHostBalances();
  const [filter, setFilter] = useState<Filter>("All");
  const toast = useRef(new Animated.Value(0)).current;

  const copy = async () => {
    if (!b.address) return;
    await Clipboard.setStringAsync(b.address);
    toast.stopAnimation();
    toast.setValue(0);
    Animated.sequence([
      Animated.timing(toast, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1100),
      Animated.timing(toast, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  const groups = useMemo(() => {
    const rows = MOCK_ALL_GAMES_LEDGER.filter((m) => filter === "All" || m.game === filter);
    const out: { day: string; rows: LedgerRow[] }[] = [];
    for (const r of rows) {
      const day = r.when.split(" · ")[0];
      const g = out.find((x) => x.day === day);
      g ? g.rows.push(r) : out.push({ day, rows: [r] });
    }
    return out;
  }, [filter]);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.screen, { paddingTop: insets.top + 56 }]}
        refreshControl={
          b.connected ? (
            <RefreshControl refreshing={b.loading} onRefresh={b.refresh} tintColor={aura.text} />
          ) : undefined
        }
      >
        {!b.connected ? (
          // Signed out: one Connect prompt — no zero balances, no history.
          <Glass style={styles.connectCard}>
            <View style={styles.connectIcon}>
              <Icon name="wallet-outline" size={28} color={aura.purpleBright} />
            </View>
            <Text style={styles.connectTitle}>Connect your wallet</Text>
            <Muted style={{ textAlign: "center", marginBottom: 14 }}>
              See your USDC, fund stakes and track winnings across every game.
            </Muted>
            <PrimaryButton label="Connect wallet" icon="link-variant" onPress={() => connect().catch(() => {})} />
          </Glass>
        ) : (
          <>
            <Glass>
              <Label>USDC balance · host wallet</Label>
              <View style={styles.bigRow}>
                <Big>{num(b.usdc, 2, b.loading)}</Big>
                <Text style={styles.unit}>USDC</Text>
              </View>
              <View style={styles.chips}>
                <View style={styles.chip}>
                  <Text style={styles.chipK}>SOL</Text>
                  <Text style={styles.chipV}>{num(b.sol, 3, b.loading)}</Text>
                </View>
                {b.skrConfigured ? (
                  <View style={styles.chip}>
                    <Text style={styles.chipK}>SKR</Text>
                    <Text style={styles.chipV}>{num(b.skr, 2, b.loading)}</Text>
                  </View>
                ) : null}
              </View>

              {b.address ? (
                <Pressable onPress={copy} style={styles.addr} hitSlop={8} accessibilityLabel="Copy wallet address">
                  <Text style={styles.addrText}>
                    {b.address.slice(0, 4)}…{b.address.slice(-4)}
                  </Text>
                  <Icon name="content-copy" size={15} color={aura.textMuted} />
                </Pressable>
              ) : null}

              <View style={styles.actions}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    label="Add funds"
                    icon="plus"
                    onPress={async () => {
                      await Clipboard.setStringAsync(b.address!);
                      Alert.alert(
                        "Add USDC",
                        `Your address is copied. Send devnet USDC to:\n\n${b.address}\n\nPull down to refresh once it lands.`
                      );
                    }}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    Alert.alert(
                      "Withdraw",
                      STAKED_ROOMS_LIVE
                        ? "Withdraw your escrowed winnings."
                        : "Your USDC already sits in your own wallet. Withdrawing winnings from escrow goes live with staked rooms."
                    )
                  }
                  style={({ pressed }) => [
                    styles.glassBtn,
                    !STAKED_ROOMS_LIVE && styles.dimmed,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Icon name="arrow-top-right" size={17} color={aura.text} />
                  <Text style={styles.glassBtnText}>Withdraw</Text>
                </Pressable>
              </View>
            </Glass>

            <View style={styles.tag}>
              <Text style={styles.tagText}>EXAMPLE DATA · history goes live with staked rooms</Text>
            </View>

            <View style={styles.head}>
              <Label>Match history</Label>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {FILTERS.map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  style={[styles.filter, filter === f && styles.filterOn]}
                >
                  <Text style={[styles.filterText, filter === f && styles.filterTextOn]}>{f}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {groups.length === 0 ? (
              <Muted style={{ textAlign: "center", marginTop: 8 }}>No {filter} matches yet.</Muted>
            ) : (
              groups.map((g) => (
                <View key={g.day} style={{ gap: 6 }}>
                  <Text style={styles.day}>{g.day}</Text>
                  <Glass style={{ paddingVertical: 4 }}>
                    {g.rows.map((m, i) => (
                      <View key={m.id} style={[styles.row, i > 0 && styles.divider]}>
                        {ICON_BY_GAME[m.game] ? (
                          <Image source={ICON_BY_GAME[m.game]} style={styles.gameIcon} />
                        ) : (
                          <View style={styles.gameIcon} />
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.title}>
                            {m.result === "won" ? "Won" : "Lost"} · {m.players}p · {m.stake} USDC stake
                          </Text>
                          <Muted style={{ fontSize: 12 }}>
                            {m.game} · {m.code}
                            {m.when.includes(" · ") ? ` · ${m.when.split(" · ")[1]}` : ""}
                          </Muted>
                        </View>
                        <Text style={[styles.delta, { color: m.delta >= 0 ? "#34D399" : "#F87171" }]}>
                          {m.delta >= 0 ? "+" : "−"}
                          {Math.abs(m.delta).toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </Glass>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.toast,
          { bottom: insets.bottom + 110, opacity: toast, transform: [{ translateY: toast.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
        ]}
      >
        <Icon name="check" size={15} color="#fff" />
        <Text style={styles.toastText}>Copied</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: aura.bg },
  screen: { paddingHorizontal: 16, paddingBottom: 130, gap: 12 },
  connectCard: { alignItems: "center", paddingVertical: 28 },
  connectIcon: {
    width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center",
    backgroundColor: aura.purpleGlow, marginBottom: 12,
  },
  connectTitle: { color: aura.text, fontWeight: "800", fontSize: 18, marginBottom: 6 },
  bigRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginVertical: 6 },
  unit: { color: aura.textMuted, fontWeight: "700", marginBottom: 6 },
  chips: { flexDirection: "row", gap: 8 },
  chip: {
    flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth, borderColor: aura.glassBorder,
  },
  chipK: { color: aura.textMuted, fontWeight: "700", fontSize: 12 },
  chipV: { color: aura.text, fontWeight: "800" },
  addr: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, alignSelf: "flex-start" },
  addrText: { color: aura.text, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 14 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14, alignItems: "stretch" },
  glassBtn: {
    flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center",
    borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth, borderColor: aura.glassBorder, minHeight: 48,
  },
  glassBtnText: { color: aura.text, fontWeight: "800" },
  dimmed: { opacity: 0.45 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
  filter: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: StyleSheet.hairlineWidth, borderColor: aura.glassBorder,
  },
  filterOn: { backgroundColor: aura.purple, borderColor: aura.purple },
  filterText: { color: aura.textMuted, fontWeight: "700" },
  filterTextOn: { color: "#fff" },
  day: { color: aura.textMuted, fontWeight: "800", fontSize: 12, letterSpacing: 0.4, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 11, gap: 10 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: aura.glassBorder },
  gameIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.06)" },
  title: { color: aura.text, fontWeight: "700" },
  delta: { fontWeight: "800", fontSize: 16 },
  tag: { alignSelf: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)" },
  tagText: { color: aura.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  toast: {
    position: "absolute", alignSelf: "center", flexDirection: "row", gap: 6, alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(20,20,28,0.92)",
    borderWidth: StyleSheet.hairlineWidth, borderColor: aura.glassBorder,
  },
  toastText: { color: "#fff", fontWeight: "700" },
});

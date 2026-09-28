import { useMemo, useRef, useState } from "react";
import {
  Animated, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View,
} from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { aura } from "../theme/tokens";
import { useHostBalances } from "../wallet/useHostBalances";
import { HostWalletCard } from "../components/wallet/HostWalletCard";
import { AURA_GAMES } from "../data/catalog";
import { Glass, Label, Muted, PrimaryButton } from "./ludo/ludoUi";
import { whenLabel } from "./ludo/ludoShared";
import { HistoryRow } from "../match/MatchClient";
import { useMatchHistory } from "../match/useMatchHistory";

const FILTERS = ["All", "Ludo", "Chess", "Snakes"] as const;
type Filter = (typeof FILTERS)[number];

const ICON_BY_GAME: Record<string, any> = Object.fromEntries(
  AURA_GAMES.map((g) => [g.title.toLowerCase().startsWith("snakes") ? "Snakes" : g.title, g.icon])
);

/** Host Wallet tab (replaces Library). Wallet UI is host-only — games never render this. */
export function WalletScreen() {
  const insets = useSafeAreaInsets();
  const b = useHostBalances();
  const [filter, setFilter] = useState<Filter>("All");
  const history = useMatchHistory();
  const navigation = useNavigation<any>();
  const toast = useRef(new Animated.Value(0)).current;

  const showToast = () => {
    toast.stopAnimation();
    toast.setValue(0);
    Animated.sequence([
      Animated.timing(toast, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1100),
      Animated.timing(toast, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  const groups = useMemo(() => {
    // Real server-recorded matches only — never example rows.
    const rows = history.rows.filter((m) => filter === "All" || m.game === filter);
    const out: { day: string; rows: HistoryRow[] }[] = [];
    for (const r of rows) {
      const day = whenLabel(r.endedAt).split(" · ")[0];
      const g = out.find((x) => x.day === day);
      g ? g.rows.push(r) : out.push({ day, rows: [r] });
    }
    return out;
  }, [filter, history.rows]);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.screen, { paddingTop: insets.top + 56 }]}
        refreshControl={
          b.connected ? (
            <RefreshControl
              refreshing={b.loading}
              onRefresh={() => {
                b.refresh();
                history.refresh();
              }}
              tintColor={aura.text}
            />
          ) : undefined
        }
      >
        <HostWalletCard balances={b} onCopied={showToast} />
        {b.connected ? (
          <>

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
              <Glass style={{ alignItems: "center", gap: 4, paddingVertical: 22 }}>
                <Icon name="history" size={22} color={aura.textDim} />
                <Text style={styles.title}>
                  {history.status === "loading"
                    ? "Loading matches…"
                      : filter === "All"
                        ? "No matches yet"
                        : `No ${filter} matches yet`}
                </Text>
                {history.status === "offline" ? (
                  <Muted style={{ textAlign: "center" }}>Can't reach the match server. Pull down to retry.</Muted>
                ) : null}
                {history.status !== "loading" ? (
                  <View style={{ alignSelf: "stretch", marginTop: 8 }}>
                    <PrimaryButton icon="dice-5" label="Play Ludo" onPress={() => navigation.navigate("LudoHub")} />
                  </View>
                ) : null}
              </Glass>
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
                            {m.result === "won" ? "Won" : "Lost"} · {m.players}p ·{" "}
                            {m.stake > 0 ? `${m.stake} USDC stake` : "Friendly · no stake"}
                          </Text>
                          <Muted style={{ fontSize: 12 }}>
                            {m.game} · {m.code}
                            {whenLabel(m.endedAt).includes(" · ") ? ` · ${whenLabel(m.endedAt).split(" · ")[1]}` : ""}
                          </Muted>
                        </View>
                        {m.stake > 0 ? (
                          <Text style={[styles.delta, { color: m.delta >= 0 ? "#34D399" : "#F87171" }]}>
                            {m.delta >= 0 ? "+" : "−"}
                            {Math.abs(m.delta).toFixed(2)}
                          </Text>
                        ) : (
                          <Muted style={{ fontSize: 12 }}>{m.place ? `#${m.place}` : "—"}</Muted>
                        )}
                      </View>
                    ))}
                  </Glass>
                </View>
              ))
            )}
          </>
        ) : null}
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
  toast: {
    position: "absolute", alignSelf: "center", flexDirection: "row", gap: 6, alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(20,20,28,0.92)",
    borderWidth: StyleSheet.hairlineWidth, borderColor: aura.glassBorder,
  },
  toastText: { color: "#fff", fontWeight: "700" },
});

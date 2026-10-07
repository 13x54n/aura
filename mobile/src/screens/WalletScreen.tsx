import { useRef, useState } from "react";
import {
  Animated, Platform, RefreshControl, ScrollView, StyleSheet, View,
} from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { aura } from "../theme/tokens";
import { rpcCooldownSecs, useHostBalances } from "../wallet/useHostBalances";
import { HostWalletCard } from "../components/wallet/HostWalletCard";
import { GlassPanel } from "../components/store/GlassPanel";

/** Host Wallet tab (replaces Library). Wallet UI is host-only — games never render this. */
export function WalletScreen() {
  const insets = useSafeAreaInsets();
  const b = useHostBalances();
  const toast = useRef(new Animated.Value(0)).current;

  const [toastText, setToastText] = useState("Copied");
  const showToast = (text = "Copied") => {
    setToastText(text);
    toast.stopAnimation();
    toast.setValue(0);
    Animated.sequence([
      Animated.timing(toast, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1100),
      Animated.timing(toast, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.screen, { paddingTop: insets.top + 56 }]}
        refreshControl={
          b.connected ? (
            <RefreshControl
              refreshing={b.loading}
              onRefresh={() => {
                const wait = rpcCooldownSecs();
                if (wait > 0) showToast(`Network busy · try in ${wait}s`);
                else b.refresh();
              }}
              tintColor={aura.text}
            />
          ) : undefined
        }
      >
        <HostWalletCard balances={b} onCopied={() => showToast()} />
        {b.connected ? (
          <>

            <Text style={styles.head}>Match history</Text>
            <GlassPanel style={styles.emptyHistory}>
              <Icon name="history" size={22} color={aura.textDim} />
              <Text style={styles.title}>No matches yet</Text>
              <Text style={styles.muted}>Play history will show here after mini-games are listed.</Text>
            </GlassPanel>
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
        <Icon name={toastText === "Copied" ? "check" : "clock-outline"} size={15} color="#fff" />
        <Text style={styles.toastText}>{toastText}</Text>
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
  head: { color: aura.textMuted, fontWeight: "800", fontSize: 12, letterSpacing: 0.4, marginTop: 2 },
  emptyHistory: { alignItems: "center", gap: 4, paddingVertical: 22, paddingHorizontal: 16, borderRadius: 18 },
  title: { color: aura.text, fontWeight: "700" },
  muted: { color: aura.textMuted, textAlign: "center" },
  toast: {
    position: "absolute", alignSelf: "center", flexDirection: "row", gap: 6, alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(20,20,28,0.92)",
    borderWidth: StyleSheet.hairlineWidth, borderColor: aura.glassBorder,
  },
  toastText: { color: "#fff", fontWeight: "700" },
});

import React, { useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, TextStyle, View, ViewStyle } from "react-native";
import { Text } from "react-native-paper";
import * as Clipboard from "expo-clipboard";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { aura } from "../../theme/tokens";
import { useMobileWallet } from "../../utils/useMobileWallet";
import { useHostBalances } from "../../wallet/useHostBalances";
import { GlassPanel } from "../store/GlassPanel";

const agoLabel = (at: number) => {
  const m = Math.floor((Date.now() - at) / 60_000);
  return m < 1 ? "<1m ago" : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
};

const num = (v: number | null, dp: number, loading: boolean) =>
  loading && v == null ? "…" : v == null ? "—" : v.toFixed(dp);

function Glass({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <GlassPanel style={style ? [styles.glass, style] : styles.glass}>{children}</GlassPanel>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}
function Big({ children }: { children: React.ReactNode }) {
  return <Text style={styles.big}>{children}</Text>;
}
function Muted({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}
function PrimaryButton({ label, onPress, icon }: { label: string; onPress: () => void; icon?: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.75 }]}>
      {icon ? <Icon name={icon as any} size={18} color="#fff" /> : null}
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

/**
 * Host wallet card. Signed out: a single Connect prompt. Games never render this.
 */
export function HostWalletCard({
  balances,
  onCopied,
}: {
  /** Pass the screen's useHostBalances() to share one fetch (Wallet pull-to-refresh). */
  balances?: ReturnType<typeof useHostBalances>;
  /** Screen-level toast; falls back to an inline "Copied". */
  onCopied?: () => void;
}) {
  const own = useHostBalances();
  const b = balances ?? own;
  const { connect } = useMobileWallet();
  const [copied, setCopied] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const copy = async () => {
    if (!b.address) return;
    await Clipboard.setStringAsync(b.address);
    if (onCopied) onCopied();
    else {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <>
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
            <PrimaryButton
              label="Connect wallet"
              icon="link-variant"
              onPress={() =>
                connect()
                  .then(() => setConnectError(null))
                  .catch((e: any) => {
                    const msg = String(e?.message ?? e);
                    console.warn("[wallet connect]", msg);
                    setConnectError(/cancel|declin|reject/i.test(msg) ? "Connection cancelled in the wallet." : msg.slice(0, 140));
                  })
              }
            />
            {connectError ? (
              <Muted style={{ textAlign: "center", fontSize: 12, marginTop: 10 }}>Couldn't connect: {connectError}</Muted>
            ) : null}
          </Glass>
        ) : (
            <Glass>
              <Label>USDC balance · host wallet</Label>
              <View style={styles.bigRow}>
                <Big>{num(b.usdc, 2, b.loading)}</Big>
                <Text style={styles.unit}>USDC</Text>
              </View>
              {b.error && b.usdc == null ? (
                <Pressable onPress={b.refresh} style={styles.errRow} accessibilityLabel="Retry balance">
                  <Icon name="alert-circle-outline" size={15} color={aura.textMuted} />
                  <Muted style={{ flex: 1, fontSize: 12 }}>Couldn't load balance: {b.error}. Tap to retry.</Muted>
                </Pressable>
              ) : null}
              {b.usdc === 0 ? (
                <Muted style={styles.updated}>No devnet USDC yet. Get some at faucet.circle.com (pick Solana Devnet).</Muted>
              ) : null}
              {b.stale && b.updatedAt ? (
                <Muted style={styles.updated}>Updated {agoLabel(b.updatedAt)}</Muted>
              ) : null}
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
                    {copied ? "Copied" : `${b.address.slice(0, 4)}…${b.address.slice(-4)}`}
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
                      "Winnings from a staked match are paid back to this wallet. There is no separate balance to withdraw."
                    )
                  }
                  style={({ pressed }) => [styles.glassBtn, pressed && { opacity: 0.7 }]}
                >
                  <Icon name="arrow-top-right" size={17} color={aura.text} />
                  <Text style={styles.glassBtnText}>Withdraw</Text>
                </Pressable>
              </View>
            </Glass>
        )}
    </>
  );
}

const styles = StyleSheet.create({
  glass: { borderRadius: 18, padding: 16 },
  label: { color: aura.textDim, fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  big: { color: aura.text, fontSize: 30, fontWeight: "800" },
  muted: { color: aura.textMuted, fontSize: 13 },
  primary: {
    flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: aura.purple, borderRadius: 14, paddingVertical: 15,
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "800" },
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
  errRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  updated: { fontSize: 12, marginTop: -2, marginBottom: 8 },
});

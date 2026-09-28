/** Shared glass + purple building blocks for the Ludo wireframe screens. */
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { GameHeader } from "../../components/top-bar/GameHeader";
import { GlassPanel } from "../../components/store/GlassPanel";
import { aura } from "../../theme/tokens";
import { BOARD_SEAT_COLORS, ESCROW_LIVE, PAID_STAKE_CHIPS } from "./ludoShared";
import type { PlayerInfo } from "../../match/MatchClient";

export function LudoScreen({
  title = "Ludo",
  children,
  footer,
  toHub,
}: {
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Close returns to the Ludo hub (not the store) — flow screens deep in the stack. */
  toHub?: boolean;
}) {
  const navigation = useNavigation<any>();
  return (
    <View style={s.root}>
      <GameHeader
        gameId="ludo"
        title={title}
        onClose={() => (toHub ? navigation.navigate("LudoHub") : navigation.goBack())}
      />
      <ScrollView contentContainerStyle={s.scroll}>{children}</ScrollView>
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </View>
  );
}

export function Glass({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <GlassPanel style={[s.glass, style as ViewStyle]}>{children}</GlassPanel>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

export function Big({ children, style }: { children: React.ReactNode; style?: any }) {
  return <Text style={[s.big, style]}>{children}</Text>;
}

export function Muted({ children, style }: { children: React.ReactNode; style?: any }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.primary, disabled && s.disabled, pressed && s.pressed]}
    >
      {icon ? <Icon name={icon as any} size={18} color="#fff" /> : null}
      <Text style={s.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.ghost, pressed && s.pressed]}>
      <Text style={s.ghostText}>{label}</Text>
    </Pressable>
  );
}

export function ActionTile({
  icon,
  title,
  sub,
  onPress,
  offline = false,
}: {
  icon: string;
  title: string;
  sub: string;
  onPress: () => void;
  /** Dim the tile and show a small "Offline" tag (still tappable; the screen explains). */
  offline?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: offline }}
      accessibilityHint={offline ? "Online play unavailable" : undefined}
      onPress={onPress}
      style={({ pressed }) => [pressed && s.pressed, offline && { opacity: 0.45 }]}
    >
      <Glass style={s.tile}>
        <View style={s.tileIcon}>
          <Icon name={icon as any} size={22} color={aura.purpleBright} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={s.tileTitle}>{title}</Text>
            {offline ? (
              <View style={s.offlineTag}>
                <Text style={s.offlineTagText}>Offline</Text>
              </View>
            ) : null}
          </View>
          <Muted>{sub}</Muted>
        </View>
        <Icon name="chevron-right" size={22} color={aura.textDim} />
      </Glass>
    </Pressable>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  format = (v) => String(v),
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  return (
    <View style={s.row}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable key={String(o)} onPress={() => onChange(o)} style={[s.chip, on && s.chipOn]}>
            <Text style={[s.chipText, on && s.chipTextOn]}>{format(o)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Stake picker. Until escrow ships only the 0 USDC friendly is selectable;
 * paid chips show but stay disabled ("Unlocks with escrow").
 */
export function StakeChips({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const options = [0, ...PAID_STAKE_CHIPS];
  return (
    <View style={{ gap: 8 }}>
      <View style={s.row}>
        {options.map((o) => {
          const locked = o > 0 && !ESCROW_LIVE;
          const on = o === value;
          return (
            <Pressable
              key={o}
              disabled={locked}
              onPress={() => onChange(o)}
              accessibilityState={{ disabled: locked, selected: on }}
              style={[s.chip, on && s.chipOn, locked && s.disabled]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                {locked ? <Icon name="lock" size={12} color={aura.textDim} /> : null}
                <Text style={[s.chipText, on && s.chipTextOn]}>{o === 0 ? "Friendly · no stake" : `${o} USDC`}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {!ESCROW_LIVE ? <Muted style={{ fontSize: 12 }}>Paid stakes unlock with escrow.</Muted> : null}
    </View>
  );
}

export function SummaryRow({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <View style={s.sumRow}>
      <Muted>{k}</Muted>
      <Text style={[s.sumVal, strong && s.sumStrong]}>{v}</Text>
    </View>
  );
}

/**
 * Lobby seats straight from the server's room.state. Empty seats read
 * "Waiting for player…"; there are never placeholder names or stats.
 */
export function SeatGrid({
  seats,
  players,
  mySeat,
  onShareCode,
}: {
  seats: number[];
  players: Record<number, PlayerInfo>;
  mySeat: number | null;
  /** Empty seats offer this so the host's next step is obvious. */
  onShareCode?: () => void;
}) {
  return (
    <View style={s.grid}>
      {seats.map((seatIdx) => {
        const p = players[seatIdx];
        const you = seatIdx === mySeat;
        const color = BOARD_SEAT_COLORS[seatIdx] ?? aura.purple;
        return (
          <Glass key={seatIdx} style={s.seatCell}>
            {p ? (
              <>
                <View style={[s.avatar, { borderColor: color }]}>
                  <Text style={s.avatarText}>{you ? "You" : p.name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={s.seatName} numberOfLines={1}>{p.name}</Text>
                <Text style={[s.seatState, p.connected !== false && { color: "#34D399" }]}>
                  {p.connected === false ? "Reconnecting…" : you ? "You · seated" : "Seated"}
                </Text>
              </>
            ) : (
              <>
                <View style={[s.avatar, s.avatarEmpty]}>
                  <Icon name="account-clock-outline" size={20} color={aura.textDim} />
                </View>
                <Muted>Waiting for player…</Muted>
                {onShareCode ? (
                  <Pressable accessibilityRole="button" onPress={onShareCode} hitSlop={6} style={s.shareCode}>
                    <Icon name="share-variant" size={13} color={aura.purpleBright} />
                    <Text style={s.shareCodeText}>Share code</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </Glass>
        );
      })}
    </View>
  );
}

export function PulseRing({ label }: { label: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 1400, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.5] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });
  return (
    <View style={s.pulseWrap}>
      <Animated.View style={[s.pulse, { transform: [{ scale }], opacity }]} />
      <View style={s.pulseCore}>
        <Icon name="dice-5" size={34} color="#fff" />
      </View>
      <Text style={[s.tileTitle, { marginTop: 28 }]}>{label}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  offlineTag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.10)" },
  offlineTagText: { color: aura.textMuted, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  root: { flex: 1, backgroundColor: aura.bg },
  scroll: { padding: 16, gap: 14, paddingBottom: 32 },
  footer: { padding: 16, paddingBottom: 28, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: aura.glassBorder, backgroundColor: aura.bg },
  glass: { borderRadius: 18, padding: 16 },
  label: { color: aura.textDim, fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  big: { color: aura.text, fontSize: 30, fontWeight: "800" },
  muted: { color: aura.textMuted, fontSize: 13 },
  primary: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: aura.purple, borderRadius: 14, paddingVertical: 15 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  ghost: { alignItems: "center", justifyContent: "center", borderRadius: 14, paddingVertical: 13, borderWidth: 1, borderColor: aura.glassBorder },
  ghostText: { color: aura.purpleBright, fontSize: 15, fontWeight: "700" },
  tile: { flexDirection: "row", alignItems: "center", gap: 14 },
  tileIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: aura.purpleGlow },
  tileTitle: { color: aura.text, fontSize: 16, fontWeight: "700" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: aura.chipIdle, borderWidth: 1, borderColor: "transparent" },
  chipOn: { backgroundColor: aura.purpleGlow, borderColor: aura.purple },
  chipText: { color: aura.textMuted, fontWeight: "700" },
  chipTextOn: { color: "#fff" },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  sumVal: { color: aura.text, fontWeight: "600" },
  sumStrong: { color: aura.purpleBright, fontWeight: "800", fontSize: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  seatCell: { width: "48%", alignItems: "center", gap: 6, paddingVertical: 18 },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 3, alignItems: "center", justifyContent: "center", backgroundColor: aura.bgElevated },
  avatarEmpty: { borderStyle: "dashed", borderColor: aura.glassBorder, borderWidth: 2, opacity: 0.6 },
  shareCode: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: aura.glassBorder },
  shareCodeText: { color: aura.purpleBright, fontWeight: "700", fontSize: 12 },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  seatName: { color: aura.text, fontWeight: "700" },
  seatState: { color: aura.textDim, fontSize: 12, fontWeight: "600" },
  pulseWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 48 },
  pulse: { position: "absolute", top: 18, width: 140, height: 140, borderRadius: 70, backgroundColor: aura.purple },
  pulseCore: { width: 80, height: 80, borderRadius: 40, backgroundColor: aura.purpleDeep, alignItems: "center", justifyContent: "center" },
});

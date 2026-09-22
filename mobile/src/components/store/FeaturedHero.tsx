import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { BlurView } from "expo-blur";
import { Platform } from "react-native";
import { aura } from "../../theme/tokens";

type Props = {
  title: string;
  blurb: string;
  onPress: () => void;
  /** Pagination dots count (visual only — Ludo is the only slide for now). */
  dotCount?: number;
};

/** Full-bleed hero with Play on the art (Arcade ref). */
export function FeaturedHero({ title, blurb, onPress, dotCount = 5 }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.hero, pressed && { opacity: 0.96 }]}
      >
        <View style={styles.art}>
          <Text style={styles.artGlyph}>{title.slice(0, 1)}</Text>
          <View style={styles.artFade} pointerEvents="none" />

          <View style={styles.overlay}>
            <Text style={styles.forYou}>For You</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.blurb}>{blurb}</Text>

            <Pressable onPress={onPress} style={styles.playWrap}>
              {Platform.OS !== "web" ? (
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.playFallback]} />
              )}
              <Text style={styles.playLabel}>Play</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>

      <View style={styles.dots}>
        {Array.from({ length: dotCount }).map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === 0 ? styles.dotActive : null]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  hero: {
    marginHorizontal: 0,
    overflow: "hidden",
  },
  art: {
    minHeight: 360,
    backgroundColor: "#3B1D6E",
    justifyContent: "flex-end",
  },
  artFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 200,
    backgroundColor: "rgba(12, 11, 20, 0.72)",
  },
  artGlyph: {
    position: "absolute",
    top: 72,
    alignSelf: "center",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 120,
    fontWeight: "900",
    color: "rgba(255,255,255,0.12)",
  },
  overlay: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    alignItems: "center",
  },
  forYou: {
    color: "rgba(255,255,255,0.8)",
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  title: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 32,
    marginBottom: 6,
    textAlign: "center",
  },
  blurb: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 18,
    maxWidth: 300,
  },
  playWrap: {
    overflow: "hidden",
    borderRadius: 24,
    paddingHorizontal: 36,
    paddingVertical: 12,
    backgroundColor: "rgba(20,16,36,0.45)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
    minWidth: 120,
    alignItems: "center",
  },
  playFallback: { backgroundColor: "rgba(20,16,36,0.75)" },
  playLabel: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 17,
    zIndex: 1,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    marginBottom: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  dotActive: {
    width: 18,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
});

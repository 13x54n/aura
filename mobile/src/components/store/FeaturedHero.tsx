import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, Button } from "react-native-paper";
import { GlassPanel } from "./GlassPanel";
import { aura } from "../../theme/tokens";

type Props = {
  eyebrow: string;
  title: string;
  blurb: string;
  onPress: () => void;
};

export function FeaturedHero({ eyebrow, title, blurb, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.92 }]}
    >
      <View style={styles.backdrop}>
        <GlassPanel style={styles.glass} intensity={60}>
          <View style={styles.inner}>
            <View style={styles.badge}>
              <Text style={styles.badgeText} variant="labelSmall">
                Hot pick
              </Text>
            </View>
            <Text style={styles.eyebrow} variant="labelLarge">
              {eyebrow}
            </Text>
            <Text style={styles.title} variant="headlineMedium">
              {title}
            </Text>
            <Text style={styles.blurb} variant="bodyMedium">
              {blurb}
            </Text>
            <Button
              mode="contained"
              onPress={onPress}
              buttonColor={aura.purple}
              textColor="#fff"
              style={styles.cta}
              labelStyle={styles.ctaLabel}
            >
              Play
            </Button>
          </View>
        </GlassPanel>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 24,
    overflow: "hidden",
  },
  backdrop: {
    backgroundColor: aura.heroAccent,
    minHeight: 220,
  },
  glass: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: "rgba(76, 29, 149, 0.35)",
  },
  inner: {
    padding: 20,
    minHeight: 220,
    justifyContent: "flex-end",
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: aura.purpleGlow,
    borderColor: aura.purpleBright,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 10,
  },
  badgeText: { color: "#fff", fontWeight: "700" },
  eyebrow: {
    color: "rgba(255,255,255,0.75)",
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: { color: "#fff", fontWeight: "800", marginBottom: 8 },
  blurb: {
    color: "rgba(255,255,255,0.85)",
    marginBottom: 16,
    maxWidth: 300,
  },
  cta: { alignSelf: "flex-start", borderRadius: 20 },
  ctaLabel: { fontWeight: "700" },
});

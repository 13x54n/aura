import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, Button } from "react-native-paper";
import { GlassPanel } from "./GlassPanel";

type Props = {
  eyebrow: string;
  title: string;
  blurb: string;
  onPress: () => void;
};

/** Featured hero — tap cover or Play → straight into the game. */
export function FeaturedHero({ eyebrow, title, blurb, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.92 }]}
    >
      <View style={styles.backdrop}>
        <GlassPanel style={styles.glass} intensity={55}>
          <View style={styles.inner}>
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
    marginTop: 8,
    borderRadius: 22,
    overflow: "hidden",
  },
  backdrop: {
    backgroundColor: "#1B3A6B",
    minHeight: 210,
  },
  glass: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: "rgba(12, 18, 36, 0.25)",
  },
  inner: {
    padding: 20,
    minHeight: 210,
    justifyContent: "flex-end",
  },
  eyebrow: {
    color: "rgba(255,255,255,0.75)",
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: {
    color: "#fff",
    fontWeight: "800",
    marginBottom: 8,
  },
  blurb: {
    color: "rgba(255,255,255,0.85)",
    marginBottom: 16,
    maxWidth: 280,
  },
  cta: {
    alignSelf: "flex-start",
    borderRadius: 20,
  },
  ctaLabel: {
    fontWeight: "700",
  },
});

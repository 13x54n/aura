import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, Button } from "react-native-paper";

type Props = {
  eyebrow: string;
  title: string;
  blurb: string;
  cta: string;
  onPress: () => void;
};

/** Featured hero — App Store “Today” / Games spotlight. */
export function FeaturedHero({ eyebrow, title, blurb, cta, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.hero, pressed && { opacity: 0.92 }]}>
      <View style={styles.gradient}>
        <Text style={styles.eyebrow} variant="labelLarge">
          {eyebrow}
        </Text>
        <Text style={styles.title} variant="headlineMedium">
          {title}
        </Text>
        <Text style={styles.blurb} variant="bodyMedium">
          {blurb}
        </Text>
        <Button mode="contained" onPress={onPress} style={styles.cta} labelStyle={styles.ctaLabel}>
          {cta}
        </Button>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 22,
    overflow: "hidden",
  },
  gradient: {
    backgroundColor: "#1B3A6B",
    padding: 20,
    minHeight: 200,
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

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

type Props = {
  title: string;
  subtitle?: string;
  badge?: string;
  accent: string;
  onPress?: () => void;
  width?: number;
};

/** Cover → Play (tap opens the game). Real titles only. */
export function GameCover({
  title,
  subtitle,
  badge,
  accent,
  onPress,
  width = 132,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.wrap, { width, opacity: pressed ? 0.88 : 1 }]}
    >
      <View style={[styles.cover, { backgroundColor: accent, width, height: width * 1.25 }]}>
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText} variant="labelSmall">
              {badge}
            </Text>
          </View>
        ) : null}
        <Text style={styles.coverGlyph} variant="displaySmall">
          {title.slice(0, 1)}
        </Text>
      </View>
      <Text style={styles.title} variant="titleSmall" numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle} variant="bodySmall" numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginRight: 14 },
  cover: {
    borderRadius: 18,
    overflow: "hidden",
    justifyContent: "flex-end",
    padding: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
  },
  coverGlyph: {
    color: "rgba(255,255,255,0.92)",
    fontWeight: "800",
    alignSelf: "flex-start",
  },
  badge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: { color: "#fff", fontWeight: "700", fontSize: 10 },
  title: { fontWeight: "700", color: "#fff" },
  subtitle: { opacity: 0.65, marginTop: 2, color: "rgba(255,255,255,0.85)" },
});

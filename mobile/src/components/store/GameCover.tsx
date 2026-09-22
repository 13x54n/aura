import React from "react";
import {
  Image,
  ImageSourcePropType,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { aura } from "../../theme/tokens";

type Props = {
  title: string;
  subtitle?: string;
  badge?: string;
  accent: string;
  cover?: ImageSourcePropType;
  onPress?: () => void;
  width?: number;
};

export function GameCover({
  title,
  subtitle,
  badge,
  accent,
  cover,
  onPress,
  width = 132,
}: Props) {
  const h = width * 1.35;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.wrap, { width, opacity: pressed ? 0.88 : 1 }]}
    >
      <View style={[styles.cover, { backgroundColor: accent, width, height: h }]}>
        {cover ? (
          <Image source={cover} style={styles.coverImg} resizeMode="cover" />
        ) : (
          <Text style={styles.coverGlyph} variant="displaySmall">
            {title.slice(0, 1)}
          </Text>
        )}
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText} variant="labelSmall">
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.title} variant="titleSmall" numberOfLines={2}>
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
    borderRadius: 20,
    overflow: "hidden",
    justifyContent: "flex-end",
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: aura.glassBorder,
  },
  coverImg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  coverGlyph: {
    color: "rgba(255,255,255,0.92)",
    fontWeight: "800",
    alignSelf: "flex-start",
    padding: 12,
  },
  badge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: aura.purpleGlow,
    borderColor: aura.purpleBright,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: { color: "#fff", fontWeight: "700", fontSize: 10 },
  title: { fontWeight: "700", color: aura.text },
  subtitle: { marginTop: 2, color: aura.textMuted },
});

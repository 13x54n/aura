import React from "react";
import {
  Image,
  ImageSourcePropType,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text, Button } from "react-native-paper";
import { GlassPanel } from "./GlassPanel";
import { aura } from "../../theme/tokens";

type Props = {
  title: string;
  subtitle: string;
  accent: string;
  icon?: ImageSourcePropType;
  onPress: () => void;
};

/** Ref-style row: icon + title + Play (no price/Buy). */
export function GameListRow({ title, subtitle, accent, icon, onPress }: Props) {
  return (
    <GlassPanel style={styles.row}>
      <Pressable onPress={onPress} style={styles.inner}>
        <View style={[styles.thumb, { backgroundColor: accent }]}>
          {icon ? (
            <Image source={icon} style={styles.thumbImg} resizeMode="cover" />
          ) : (
            <Text style={styles.glyph}>{title.slice(0, 1)}</Text>
          )}
        </View>
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Button
          mode="contained"
          compact
          onPress={onPress}
          buttonColor={aura.purple}
          textColor="#fff"
          style={styles.play}
          labelStyle={styles.playLabel}
        >
          Play
        </Button>
      </Pressable>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  row: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 18,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: aura.glassBorder,
  },
  thumbImg: { width: 56, height: 56 },
  glyph: { color: "#fff", fontWeight: "800", fontSize: 22 },
  meta: { flex: 1 },
  title: { color: aura.text, fontWeight: "700", fontSize: 15 },
  subtitle: { color: aura.textMuted, marginTop: 2, fontSize: 12 },
  play: { borderRadius: 16 },
  playLabel: { fontWeight: "700", fontSize: 12, marginVertical: 2 },
});

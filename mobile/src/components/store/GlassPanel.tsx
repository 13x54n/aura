import React from "react";
import { Platform, StyleSheet, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { aura } from "../../theme/tokens";

type Props = {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  intensity?: number;
};

export function GlassPanel({ children, style, intensity = 48 }: Props) {
  if (Platform.OS === "web") {
    return <View style={[styles.fallback, style]}>{children}</View>;
  }
  return (
    <BlurView intensity={intensity} tint="dark" style={[styles.blur, style]}>
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  blur: {
    overflow: "hidden",
    backgroundColor: aura.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: aura.glassBorder,
  },
  fallback: {
    backgroundColor: aura.glassStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: aura.glassBorder,
  },
});

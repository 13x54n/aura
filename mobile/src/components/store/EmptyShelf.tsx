import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { GlassPanel } from "./GlassPanel";
import { aura } from "../../theme/tokens";

type Props = { title: string; body: string };

export function EmptyShelf({ title, body }: Props) {
  return (
    <GlassPanel style={styles.panel}>
      <View style={styles.inner}>
        <Text style={styles.title} variant="titleMedium">
          {title}
        </Text>
        <Text style={styles.body} variant="bodyMedium">
          {body}
        </Text>
      </View>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  panel: { marginHorizontal: 16, marginTop: 12, borderRadius: 18 },
  inner: { padding: 20 },
  title: { fontWeight: "700", color: aura.text, marginBottom: 6 },
  body: { color: aura.textMuted },
});

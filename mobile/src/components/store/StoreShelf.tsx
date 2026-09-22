import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { aura } from "../../theme/tokens";

type Props = { label: string; children: React.ReactNode };

export function StoreShelf({ label, children }: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.label} variant="titleMedium">
        {label}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 22 },
  label: {
    fontWeight: "800",
    marginBottom: 12,
    paddingHorizontal: 16,
    color: aura.text,
  },
  row: { paddingHorizontal: 16, paddingRight: 8 },
});

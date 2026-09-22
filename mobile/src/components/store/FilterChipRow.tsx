import React from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { aura } from "../../theme/tokens";

type Chip = { id: string; label: string };

type Props = {
  chips: Chip[];
  activeId: string;
  onChange: (id: string) => void;
};

export function FilterChipRow({ chips, activeId, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {chips.map((c) => {
        const active = c.id === activeId;
        return (
          <Pressable
            key={c.id}
            onPress={() => onChange(c.id)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {c.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, gap: 10, paddingBottom: 2 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 22,
    backgroundColor: aura.chipIdle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: aura.glassBorder,
  },
  chipActive: {
    backgroundColor: aura.purple,
    borderColor: aura.purpleBright,
  },
  label: {
    color: aura.textMuted,
    fontWeight: "600",
    fontSize: 13,
  },
  labelActive: { color: "#fff" },
});

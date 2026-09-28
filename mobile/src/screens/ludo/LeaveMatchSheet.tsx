import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { aura } from "../../theme/tokens";
import { Glass, Muted, PrimaryButton } from "./ludoUi";

/**
 * Shared "Leave match?" confirm for a live room board (header X, nav.close,
 * Android hardware back, back gesture). Keep playing is the big default.
 * Android back while open = Keep playing (Modal onRequestClose).
 */
export function LeaveMatchSheet({
  visible,
  stake,
  onKeep,
  onLeave,
}: {
  visible: boolean;
  stake: number;
  onKeep: () => void;
  onLeave: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onKeep} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onKeep} accessibilityLabel="Keep playing" />
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <Glass style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Leave match?</Text>
          <Muted style={styles.body}>
            {stake > 0 ? `You'll lose your ${stake} USDC stake.` : "You'll forfeit this match."}
          </Muted>
          <PrimaryButton label="Keep playing" onPress={onKeep} />
          <Pressable
            accessibilityRole="button"
            onPress={onLeave}
            style={({ pressed }) => [styles.leave, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.leaveText}>Leave & forfeit</Text>
          </Pressable>
        </Glass>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.55)" },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    gap: 12,
    padding: 20,
    paddingBottom: 32,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: aura.glassStrong,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: aura.glassBorder, marginBottom: 4 },
  title: { color: aura.text, fontSize: 20, fontWeight: "800" },
  body: { marginBottom: 6 },
  leave: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.5)",
  },
  leaveText: { color: "#F87171", fontWeight: "700", fontSize: 15 },
});

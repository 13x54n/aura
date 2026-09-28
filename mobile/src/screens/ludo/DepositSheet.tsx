import React, { useEffect } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { aura } from "../../theme/tokens";
import { GhostButton, Glass, Muted, PrimaryButton, SummaryRow } from "./ludoUi";
import { EscrowSnapshot } from "../../match/MatchClient";
import { useDeposit } from "../../escrow/useDeposit";
import { depositView } from "../../escrow/depositCopy";

/**
 * "Lock {stake} USDC for this table" glass bottom sheet.
 * Expo Go: Phantom signTransaction deeplink; dev build: MWA. The phone builds the tx
 * (fresh blockhash, player = fee payer + sole signer), submits it, and the server's
 * confirm-deposit reads the room account. "Locked ✓" only after that chain read.
 */
export function DepositSheet({
  visible,
  escrow,
  mySeat,
  onClose,
  onLeave,
}: {
  visible: boolean;
  escrow: EscrowSnapshot;
  mySeat: number | null;
  onClose: () => void;
  onLeave: () => void;
}) {
  const { state, start } = useDeposit(escrow, mySeat);
  // Ready comes only from the server's room-account read (room.state), never from the sig.
  const chainLocked = mySeat != null && escrow.seats[mySeat]?.state === "ready";
  const view = depositView(state, escrow.stake, chainLocked);
  const busy = view.spinner;
  const url = state?.step === "locked" ? state.url : null;

  useEffect(() => {
    if (chainLocked && visible) {
      const t = setTimeout(onClose, 1500);
      return () => clearTimeout(t);
    }
  }, [chainLocked, visible, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => !busy && onClose()} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={() => !busy && onClose()} accessibilityLabel="Close" />
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <Glass style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Lock {escrow.stake} USDC for this table</Text>
          <View>
            <SummaryRow k="Pot" v={`${escrow.pot} USDC`} />
            <SummaryRow k={`Fee (${(escrow.feeBps ?? 500) / 100}%)`} v={`${escrow.fee} USDC`} />
            <SummaryRow k="Your take if you win" v={`${escrow.payout} USDC`} strong />
          </View>
          <Muted style={{ fontSize: 13 }}>Refunded automatically if the match doesn't start.</Muted>

          {view.status ? (
            <View style={styles.statusRow}>
              {view.spinner ? <ActivityIndicator color={aura.purpleBright} /> : null}
              {chainLocked ? <Icon name="check-circle" size={18} color="#34D399" /> : null}
              <Text style={[styles.status, chainLocked && { color: "#34D399" }]}>{view.status}</Text>
            </View>
          ) : null}
          {view.detail ? <Text style={styles.note}>{view.detail}</Text> : null}

          {view.primary ? <PrimaryButton icon="wallet" label={view.primary.label} onPress={start} /> : null}
          {view.leave ? <GhostButton label="Leave table" onPress={onLeave} /> : null}

          {url ? (
            <Pressable onPress={() => Linking.openURL(url)} style={styles.link} accessibilityRole="link">
              <Icon name="open-in-new" size={14} color={aura.purpleBright} />
              <Text style={styles.linkText}>View transaction</Text>
            </Pressable>
          ) : null}
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
  note: { color: aura.textMuted, fontSize: 13 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 4 },
  status: { color: aura.text, fontSize: 15, fontWeight: "700" },
  link: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  linkText: { color: aura.purpleBright, fontWeight: "700" },
});

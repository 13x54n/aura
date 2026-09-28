import React, { useEffect } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { aura } from "../../theme/tokens";
import { GhostButton, Glass, Muted, PrimaryButton, SummaryRow } from "./ludoUi";
import { EscrowSnapshot } from "../../match/MatchClient";
import { useDeposit } from "../../escrow/useDeposit";
import { cancelPhantomSign, reopenPhantomSign } from "../../utils/phantomDeeplink";

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
}: {
  visible: boolean;
  escrow: EscrowSnapshot;
  mySeat: number | null;
  onClose: () => void;
}) {
  const { state, start, notAnswered, walletName } = useDeposit(escrow, mySeat);
  // Ready comes only from the server's room-account read (room.state), never from the sig.
  const chainLocked = mySeat != null && escrow.seats[mySeat]?.state === "ready";
  const step = state?.step;
  const busy = !chainLocked && (step === "connecting" || step === "preparing" || step === "wallet" || step === "sending" || step === "confirming" || step === "locked");
  const sig = state && "sig" in state ? state.sig : null;
  const url = state?.step === "locked" ? state.url : null;

  useEffect(() => {
    if (chainLocked && visible) {
      const t = setTimeout(onClose, 1500);
      return () => clearTimeout(t);
    }
  }, [chainLocked, visible, onClose]);

  const label = chainLocked
    ? "Locked ✓"
    : step === "connecting"
      ? `Reconnecting ${walletName}…`
      : step === "preparing"
        ? "Preparing…"
        : step === "wallet"
          ? `Waiting for ${walletName}…`
          : step === "sending"
            ? "Sending…"
            : step === "confirming" || step === "locked"
              ? "Confirming on-chain…"
              : step === "cancelled" || step === "error"
                ? "Try again"
                : `Approve in ${walletName}`;

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

          {state?.step === "wallet" && state.retry ? (
            <Text style={styles.note}>Took a bit long — approve again in {walletName}.</Text>
          ) : null}
          {state?.step === "cancelled" ? <Text style={styles.note}>Cancelled in {walletName}.</Text> : null}
          {state?.step === "error" ? <Text style={styles.note}>{state.message}</Text> : null}

          <PrimaryButton
            icon={chainLocked ? "check-circle" : busy ? undefined : "wallet"}
            label={label}
            disabled={busy || chainLocked}
            onPress={start}
          />
          {busy ? <ActivityIndicator color={aura.purpleBright} /> : null}

          {step === "wallet" && notAnswered ? (
            <View style={{ gap: 8 }}>
              <Muted style={{ fontSize: 13, textAlign: "center" }}>Still waiting for {walletName}.</Muted>
              <PrimaryButton icon="open-in-new" label={`Open ${walletName} again`} onPress={() => reopenPhantomSign()} />
              <GhostButton label="Cancel" onPress={() => cancelPhantomSign()} />
            </View>
          ) : null}

          {url || sig ? (
            <Pressable onPress={() => url && Linking.openURL(url)} style={styles.link} accessibilityRole="link">
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
  link: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  linkText: { color: aura.purpleBright, fontWeight: "700" },
});

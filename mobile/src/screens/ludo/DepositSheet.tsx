import React, { useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { aura } from "../../theme/tokens";
import { Glass, Muted, PrimaryButton, SummaryRow } from "./ludoUi";
import { EscrowSnapshot, matchClient } from "../../match/MatchClient";
import { useMobileWallet } from "../../utils/useMobileWallet";

type Step = "idle" | "building" | "wallet" | "confirming" | "locked" | "error";

/**
 * "Lock {stake} USDC for this table" glass bottom sheet. The server builds the
 * deposit tx for this seat's bound wallet; the wallet only signs; the server relays
 * it and confirms by reading the on-chain room account.
 */
export function DepositSheet({
  visible,
  escrow,
  onClose,
}: {
  visible: boolean;
  escrow: EscrowSnapshot;
  onClose: () => void;
}) {
  const { signTransaction } = useMobileWallet();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const busy = step === "building" || step === "wallet" || step === "confirming";

  const approve = async () => {
    setError(null);
    setStep("building");
    const built = await matchClient.buildDeposit();
    if ("error" in built) {
      setStep("error");
      return setError(built.message || "Couldn't prepare the deposit.");
    }
    let signed: Transaction;
    try {
      setStep("wallet");
      signed = await signTransaction(Transaction.from(Buffer.from(built.tx, "base64")));
    } catch (e: any) {
      setStep("error");
      return setError(e?.message?.includes("declin") ? "You declined in the wallet." : e?.message || "Wallet didn't sign.");
    }
    setStep("confirming");
    const sent = await matchClient.submitDeposit(signed.serialize().toString("base64"));
    if ("error" in sent) {
      setStep("error");
      return setError(sent.message || "Deposit didn't go through. Nothing was taken if it failed.");
    }
    setUrl(sent.url);
    setStep("locked");
  };

  const buttonLabel =
    step === "building" ? "Preparing…" : step === "wallet" ? "Waiting for wallet…" : step === "confirming" ? "Confirming on-chain…" : step === "locked" ? "Locked ✓" : step === "error" ? "Try again" : "Approve in wallet";

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
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton
            icon={step === "locked" ? "check-circle" : busy ? undefined : "wallet"}
            label={buttonLabel}
            disabled={busy || step === "locked"}
            onPress={approve}
          />
          {busy ? <ActivityIndicator color={aura.purpleBright} /> : null}
          {url ? (
            <Pressable onPress={() => Linking.openURL(url)} style={styles.link} accessibilityRole="link">
              <Icon name="open-in-new" size={14} color={aura.purpleBright} />
              <Text style={styles.linkText}>View transaction</Text>
            </Pressable>
          ) : null}
          {step === "locked" ? <PrimaryButton label="Done" onPress={onClose} /> : null}
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
  error: { color: aura.textDim, fontSize: 13 },
  link: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  linkText: { color: aura.purpleBright, fontWeight: "700" },
});

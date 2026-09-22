import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Text, TextInput, HelperText, Divider } from "react-native-paper";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { alertAndLog } from "../../utils/alertAndLog";
import { matchService } from "../../match/MatchService";
import { useMobileWallet } from "../../utils/useMobileWallet";
import { useAuthorization } from "../../utils/useAuthorization";
import { aura } from "../../theme/tokens";

type EscrowParams = {
  Escrow: {
    mode: "create" | "join" | "random";
    roomCode: string;
  };
};

/**
 * Host-only skill-match escrow gate — stake before WebView mounts.
 * Board/rules never see wallet or PDA details.
 */
export function EscrowScreen() {
  const route = useRoute<RouteProp<EscrowParams, "Escrow">>();
  const navigation = useNavigation<any>();
  const { mode, roomCode } = route.params;
  const [stake, setStake] = useState("0.1");
  const [busy, setBusy] = useState(false);
  const { selectedAccount } = useAuthorization();
  const { connect } = useMobileWallet();

  const lockAndPlay = async () => {
    try {
      setBusy(true);
      if (!selectedAccount) {
        await connect();
      }
      // Stub deposit — real PDA tx lands with Seed Vault (Sep 30).
      alertAndLog(
        "Stake locked (stub)",
        `${stake} SOL escrowed for room ${roomCode}. Opening Ludo WebView — escrow stays on the host.`
      );
      const match = matchService.create(`ludo-${roomCode}`);
      matchService.command(match.matchId, { type: "join" });
      matchService.command(match.matchId, { type: "ready" });
      navigation.replace("WebGame", {
        gameId: "ludo",
        title: "Ludo",
        matchId: match.matchId,
        roomCode,
        stake,
        escrowLocked: true,
      });
    } catch (e) {
      alertAndLog(
        "Escrow failed",
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>
        Skill match escrow
      </Text>
      <Text variant="bodyMedium" style={styles.blurb}>
        Host locks stake before the board loads. The WebView only plays rules —
        never wallet or payout UI. Winner payout uses a server-attested result.
      </Text>

      <Text variant="labelLarge">Room · {roomCode}</Text>
      <Text variant="labelLarge" style={{ marginBottom: 8 }}>
        Mode · {mode}
      </Text>

      <TextInput
        label="Stake amount (SOL)"
        value={stake}
        onChangeText={setStake}
        keyboardType="decimal-pad"
        mode="outlined"
      />
      <HelperText type="info">
        Demo amounts. Real PDA deposit lands with Seed Vault (by Sep 30).
      </HelperText>

      <Divider style={{ marginVertical: 12 }} />

      <Button mode="contained" loading={busy} disabled={busy} onPress={lockAndPlay}>
        Lock stake &amp; Play
      </Button>
      <Button
        mode="text"
        style={{ marginTop: 8 }}
        onPress={() => navigation.goBack()}
        disabled={busy}
      >
        Cancel
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 4, backgroundColor: aura.bg },
  title: { fontWeight: "800", marginBottom: 4, color: aura.text },
  blurb: { opacity: 0.75, marginBottom: 12, color: aura.textMuted },
});

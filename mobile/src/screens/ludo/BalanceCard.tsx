import React from "react";
import { Alert, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Text } from "react-native-paper";
import { useMobileWallet } from "../../utils/useMobileWallet";
import { aura } from "../../theme/tokens";
import { Big, GhostButton, Glass, Label, Muted } from "./ludoUi";
import { useHostUsdc } from "./useHostUsdc";

/** One host USDC balance card, identical on Ludo Hub and Wallet. */
export function BalanceCard() {
  const { connect } = useMobileWallet();
  const { balance, loading, connected, address } = useHostUsdc();
  return (
    <Glass>
      <Label>USDC balance · host wallet</Label>
      <View style={styles.row}>
        <Big>{!connected ? "—" : loading || balance == null ? "…" : balance.toFixed(2)}</Big>
        <Text style={styles.unit}>USDC</Text>
      </View>
      <Muted>
        {address
          ? `${address.slice(0, 4)}…${address.slice(-4)} · stakes lock in host escrow`
          : "Connect your wallet to see your balance."}
      </Muted>
      <View style={{ marginTop: 12 }}>
        <GhostButton label={connected ? "Add funds" : "Connect wallet"} onPress={async () => {
            if (!connected || !address) {
              connect().catch(() => {});
              return;
            }
            await Clipboard.setStringAsync(address);
            Alert.alert(
              "Add USDC",
              `Your wallet address is copied. Send devnet USDC to:\n\n${address}\n\nYour balance updates here once it lands.`
            );
          }} />
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginVertical: 6 },
  unit: { color: aura.textMuted, fontWeight: "700", marginBottom: 6 },
});

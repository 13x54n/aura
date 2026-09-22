import { useState, useCallback } from "react";
import { Button, Text } from "react-native-paper";
import { View, StyleSheet } from "react-native";
import { alertAndLog } from "../../utils/alertAndLog";
import { useAuthorization } from "../../utils/useAuthorization";
import { useMobileWallet } from "../../utils/useMobileWallet";
import { isExpoGo } from "../../utils/isExpoGo";

/**
 * Expo Go → mock connect (UI / Ludo day-to-day).
 * Custom Seeker client → Seed Vault via MWA.
 */
export function ConnectButton() {
  const { connect, isExpoGo: expoGo } = useMobileWallet();
  const [authorizationInProgress, setAuthorizationInProgress] = useState(false);
  const handleConnectPress = useCallback(async () => {
    try {
      if (authorizationInProgress) {
        return;
      }
      setAuthorizationInProgress(true);
      await connect();
    } catch (err: any) {
      alertAndLog(
        "Error during connect",
        err instanceof Error ? err.message : err
      );
    } finally {
      setAuthorizationInProgress(false);
    }
  }, [authorizationInProgress, connect]);
  return (
    <Button
      mode="contained"
      icon={expoGo ? "cellphone" : "shield-key"}
      disabled={authorizationInProgress}
      onPress={handleConnectPress}
      style={{ flex: 1 }}
    >
      {expoGo ? "Connect (Expo Go mock)" : "Connect Seed Vault"}
    </Button>
  );
}

export function SignInButton() {
  const { signIn, isExpoGo: expoGo } = useMobileWallet();
  const [signInInProgress, setSignInInProgress] = useState(false);
  const handleConnectPress = useCallback(async () => {
    try {
      if (signInInProgress) {
        return;
      }
      setSignInInProgress(true);
      await signIn({
        domain: "aura.app",
        statement: "Sign into Aura (CLOCK IN)",
        uri: "https://aura.app",
      });
    } catch (err: any) {
      alertAndLog(
        "Error during sign in",
        err instanceof Error ? err.message : err
      );
    } finally {
      setSignInInProgress(false);
    }
  }, [signInInProgress, signIn]);
  if (expoGo) {
    return null;
  }
  return (
    <Button
      mode="outlined"
      disabled={signInInProgress}
      onPress={handleConnectPress}
      style={{ marginLeft: 4, flex: 1 }}
    >
      Sign in (SIWS)
    </Button>
  );
}

export function ConnectHint() {
  const expoGo = isExpoGo();
  return (
    <View style={styles.hintWrap}>
      <Text variant="bodySmall" style={styles.hint}>
        {expoGo
          ? "Expo Go: mock wallet for UI/Ludo. Real Seed Vault needs the Seeker custom client (by Sep 30)."
          : "Opens MWA. Choose Seeker Seed Vault on device. Phantom is fine for Android smoke-tests only."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hintWrap: { marginTop: 8 },
  hint: { opacity: 0.65 },
});

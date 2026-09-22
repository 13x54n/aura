import { useState, useCallback } from "react";
import { Button, Text } from "react-native-paper";
import { View, StyleSheet } from "react-native";
import { alertAndLog } from "../../utils/alertAndLog";
import { useAuthorization } from "../../utils/useAuthorization";
import { useMobileWallet } from "../../utils/useMobileWallet";

/**
 * Primary connect = Seeker Seed Vault via MWA.
 * Other MWA wallets (e.g. Phantom) work for Mac smoke-tests only —
 * Milestone 1 on device requires Seed Vault on Seeker.
 */
export function ConnectButton() {
  const { authorizeSession } = useAuthorization();
  const { connect } = useMobileWallet();
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
  }, [authorizationInProgress, authorizeSession, connect]);
  return (
    <Button
      mode="contained"
      icon="shield-key"
      disabled={authorizationInProgress}
      onPress={handleConnectPress}
      style={{ flex: 1 }}
    >
      Connect Seed Vault
    </Button>
  );
}

export function SignInButton() {
  const { authorizeSession } = useAuthorization();
  const { signIn } = useMobileWallet();
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
  }, [signInInProgress, authorizeSession, signIn]);
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
  return (
    <View style={styles.hintWrap}>
      <Text variant="bodySmall" style={styles.hint}>
        Opens MWA. Choose Seeker Seed Vault on device. Phantom is fine for Mac
        emulator smoke-tests only.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hintWrap: { marginTop: 8 },
  hint: { opacity: 0.65 },
});

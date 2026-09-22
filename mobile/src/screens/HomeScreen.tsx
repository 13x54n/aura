import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Card, Text, Button, Chip } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";

import { useAuthorization } from "../utils/useAuthorization";
import { SignInFeature } from "../components/sign-in/sign-in-feature";
import { ellipsify } from "../utils/ellipsify";

/**
 * Store shell — thin first-party shelf (not a dApp Store catalog).
 * One live tile: Ludo. Everything else: Coming soon.
 */
export function HomeScreen() {
  const navigation = useNavigation<any>();
  const { selectedAccount } = useAuthorization();

  return (
    <ScrollView contentContainerStyle={styles.screenContainer}>
      <Text style={styles.title} variant="headlineLarge">
        Aura
      </Text>
      <Text style={styles.subtitle} variant="bodyMedium">
        CLOCK IN — first-party Seeker games. Skill matches with on-chain escrow.
        Not a casino.
      </Text>

      <Card style={styles.walletCard} mode="outlined">
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionLabel}>
            Wallet
          </Text>
          {selectedAccount ? (
            <>
              <Chip icon="shield-key" style={styles.chip}>
                Connected · {ellipsify(selectedAccount.publicKey.toBase58())}
              </Chip>
              <Text variant="bodySmall" style={styles.hint}>
                Expo Go: Phantom (real). Seeker Seed Vault is preferred when the
                custom client is present.
              </Text>
            </>
          ) : (
            <>
              <Text variant="bodySmall" style={styles.hint}>
                Connect Phantom here in Expo Go. On the Seeker custom client,
                Seed Vault is preferred automatically (cutover by Sep 30).
              </Text>
              <SignInFeature />
            </>
          )}
        </Card.Content>
      </Card>

      <Text variant="titleMedium" style={[styles.sectionLabel, { marginTop: 20 }]}>
        Games
      </Text>

      <Card
        style={styles.gameCard}
        mode="elevated"
        onPress={() => navigation.navigate("LudoHub")}
      >
        <Card.Content>
          <View style={styles.gameRow}>
            <View style={{ flex: 1 }}>
              <Text variant="titleLarge">Ludo</Text>
              <Text variant="bodyMedium" style={styles.gameBlurb}>
                Staked skill match · create / join / random · SOL escrow
              </Text>
              <Chip compact style={styles.liveChip} textStyle={{ fontSize: 11 }}>
                CLOCK IN demo
              </Chip>
            </View>
            <Button mode="contained" onPress={() => navigation.navigate("LudoHub")}>
              Play
            </Button>
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.comingCard} mode="outlined">
        <Card.Content>
          <Text variant="titleMedium">Coming soon</Text>
          <Text variant="bodySmall" style={styles.hint}>
            More first-party Aura titles will land here. This shelf is ours —
            not a third-party catalog.
          </Text>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontWeight: "800",
    marginBottom: 4,
  },
  subtitle: {
    opacity: 0.75,
    marginBottom: 16,
  },
  sectionLabel: {
    fontWeight: "700",
    marginBottom: 8,
  },
  walletCard: {
    marginBottom: 8,
  },
  gameCard: {
    marginBottom: 12,
  },
  comingCard: {
    opacity: 0.85,
  },
  gameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  gameBlurb: {
    opacity: 0.7,
    marginVertical: 6,
  },
  hint: {
    opacity: 0.7,
    marginTop: 8,
    marginBottom: 4,
  },
  chip: {
    alignSelf: "flex-start",
    marginTop: 8,
  },
  liveChip: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
});

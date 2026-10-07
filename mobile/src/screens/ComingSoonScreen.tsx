import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

export function ComingSoonScreen() {
  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>
        Coming soon
      </Text>
      <Text variant="bodyMedium" style={styles.blurb}>
        Aura is the Seeker store. Mini-games are published separately and open from a URL.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontWeight: "800", marginBottom: 8 },
  blurb: { opacity: 0.75 },
});

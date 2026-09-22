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
        Aura is a thin shelf of our own Seeker games. More titles after the
        CLOCK IN Ludo wedge.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontWeight: "800", marginBottom: 8 },
  blurb: { opacity: 0.75 },
});

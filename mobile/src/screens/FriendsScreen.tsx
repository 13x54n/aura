import { useSafeAreaInsets } from "react-native-safe-area-context";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { EmptyShelf } from "../components/store/EmptyShelf";
import { aura } from "../theme/tokens";

export function FriendsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 52 }]}>
      <Text style={styles.heading} variant="headlineSmall">
        Friends
      </Text>
      <EmptyShelf
        title="No friends yet"
        body="Invite friends to skill matches once realtime rooms land. Empty on purpose — not broken."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: aura.bg, paddingTop: 56 },
  heading: {
    fontWeight: "800",
    color: aura.text,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
});

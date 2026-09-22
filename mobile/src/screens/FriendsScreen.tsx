import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { EmptyShelf } from "../components/store/EmptyShelf";

export function FriendsScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.heading} variant="headlineSmall">
        Friends
      </Text>
      <EmptyShelf
        title="No friends yet"
        body="Invite friends to skill matches once realtime rooms land. This tab stays empty until that ships — not broken."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B1020", paddingTop: 8 },
  heading: {
    fontWeight: "800",
    color: "#fff",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
});

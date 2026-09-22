import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Text, TextInput, HelperText } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";

export function CreateRoomScreen() {
  const navigation = useNavigation<any>();
  const [roomName, setRoomName] = useState("ludo-" + Math.random().toString(36).slice(2, 7));

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>
        Create room
      </Text>
      <Text variant="bodyMedium" style={styles.blurb}>
        Stub UI — no matchmaking server yet. Continues to skill-match escrow.
      </Text>
      <TextInput
        label="Room code"
        value={roomName}
        onChangeText={setRoomName}
        mode="outlined"
        style={styles.input}
      />
      <HelperText type="info">
        Share this code with your opponent after escrow.
      </HelperText>
      <Button
        mode="contained"
        onPress={() =>
          navigation.navigate("Escrow", {
            mode: "create",
            roomCode: roomName,
          })
        }
      >
        Continue to escrow
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8 },
  title: { fontWeight: "800" },
  blurb: { opacity: 0.75, marginBottom: 8 },
  input: { marginBottom: 4 },
});

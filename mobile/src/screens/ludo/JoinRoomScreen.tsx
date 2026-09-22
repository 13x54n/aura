import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Text, TextInput } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";

export function JoinRoomScreen() {
  const navigation = useNavigation<any>();
  const [roomCode, setRoomCode] = useState("");

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>
        Join room
      </Text>
      <Text variant="bodyMedium" style={styles.blurb}>
        Stub UI — enter a room code, then stake via skill-match escrow.
      </Text>
      <TextInput
        label="Room code"
        value={roomCode}
        onChangeText={setRoomCode}
        mode="outlined"
        autoCapitalize="none"
        style={styles.input}
      />
      <Button
        mode="contained"
        disabled={!roomCode.trim()}
        onPress={() =>
          navigation.navigate("Escrow", {
            mode: "join",
            roomCode: roomCode.trim(),
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
  input: { marginBottom: 8 },
});

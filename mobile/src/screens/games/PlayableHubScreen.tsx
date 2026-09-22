import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Text, Card, Chip } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { aura } from "../../theme/tokens";

type Props = {
  title: string;
  blurb: string;
  badge?: string;
  gameId: string;
};

/**
 * Playable shelf hub — room stubs shared pattern; deepen after Ludo prize path.
 */
export function PlayableHubScreen({ title, blurb, badge = "Playable", gameId }: Props) {
  const navigation = useNavigation<any>();
  return (
    <View style={styles.container}>
      <Chip compact style={styles.chip} textStyle={styles.chipText}>
        {badge}
      </Chip>
      <Text variant="headlineSmall" style={styles.title}>
        {title}
      </Text>
      <Text variant="bodyMedium" style={styles.blurb}>
        {blurb}
      </Text>

      <Card style={styles.card} mode="outlined">
        <Card.Content style={styles.actions}>
          <Button
            mode="contained"
            icon="play"
            onPress={() => navigation.navigate("WebGame", { gameId, title })}
          >
            Play
          </Button>
          <Button mode="outlined" icon="plus-box" onPress={() => {}}>
            Create room
          </Button>
          <Button mode="outlined" icon="login" onPress={() => {}}>
            Join room
          </Button>
          <Button mode="outlined" icon="sword-cross" onPress={() => {}}>
            Random match
          </Button>
        </Card.Content>
      </Card>

      <Text variant="bodySmall" style={styles.note}>
        Room stubs for now — same wallet / escrow pattern as Ludo. Deepen after
        the CLOCK IN Ludo path.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: aura.bg,
  },
  chip: {
    alignSelf: "flex-start",
    backgroundColor: aura.purpleGlow,
    marginBottom: 10,
  },
  chipText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  title: { fontWeight: "800", color: aura.text, marginBottom: 8 },
  blurb: { color: aura.textMuted, marginBottom: 16 },
  card: {
    backgroundColor: aura.bgElevated,
    borderColor: aura.glassBorder,
  },
  actions: { gap: 10 },
  note: { marginTop: 16, color: aura.textDim },
});

import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { aura } from "../../theme/tokens";
import { ActionTile, Glass, Label, LudoScreen, Muted, PrimaryButton } from "./ludoUi";
import { HostWalletCard } from "../../components/wallet/HostWalletCard";
import { matchClient } from "../../match/MatchClient";
import { whenLabel } from "./ludoShared";
import { useMatchHistory } from "../../match/useMatchHistory";

/** Hub pill: can this phone actually reach the match server? Re-checked on focus. */
function useServerReachable() {
  const [state, setState] = useState<"checking" | "ok" | "down">("checking");
  const check = useCallback(() => {
    setState("checking");
    matchClient.checkServer().then((ok) => setState(ok ? "ok" : "down"));
  }, []);
  useFocusEffect(
    useCallback(() => {
      check();
    }, [check])
  );
  return { state, check, url: matchClient.getServerUrl() };
}

/** The saved room code, only while the server says that table is still playing. */
function useLiveSavedRoom() {
  const [code, setCode] = useState<string | null>(null);
  // Re-peek every time the hub gains focus (coming back from a board / lobby).
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        await matchClient.ready();
        const saved = matchClient.savedRoomCode;
        if (!saved) {
          if (alive) setCode(null);
          return;
        }
        const info = await matchClient.peekRoom(saved).catch(() => null);
        if (alive) setCode(info && !("error" in info) && info.status === "playing" ? saved : null);
      })();
      return () => {
        alive = false;
      };
    }, [])
  );
  return code;
}

/**
 * Ludo home (wireframe 1). One glass screen — no second tab bar inside Ludo:
 * host USDC balance · Create / Join / Quick · Recent strip → Wallet/history.
 */
export function LudoHubScreen() {
  const navigation = useNavigation<any>();
  const history = useMatchHistory();
  const recent = history.rows.filter((r) => r.game === "Ludo").slice(0, 8);
  const rejoin = useLiveSavedRoom();
  const server = useServerReachable();

  return (
    <LudoScreen>
      <HostWalletCard />

      <Pressable onPress={server.check} style={styles.serverPill} accessibilityRole="button">
        <View
          style={[
            styles.dot,
            { backgroundColor: server.state === "ok" ? "#34D399" : server.state === "down" ? "#F87171" : aura.textDim },
          ]}
        />
        <Text style={styles.serverText}>
          {server.state === "ok"
            ? "Connected to match server"
            : server.state === "down"
              ? __DEV__
                ? `Can't reach match server (${server.url.replace("ws://", "")}). Run npm run match-server in mobile/ on the Mac, same Wi-Fi. Tap to retry.`
                : "Online play unavailable · Tap to retry"
              : "Checking match server…"}
        </Text>
      </Pressable>

      {rejoin ? (
        <ActionTile
          icon="backup-restore"
          title={`Rejoin table ${rejoin}`}
          sub="Your match is still running"
          onPress={() =>
            navigation.navigate("WebGame", { gameId: "ludo", title: "Ludo", roomCode: rejoin, mode: "join" })
          }
        />
      ) : null}

      <ActionTile
        icon="play-circle"
        title="Free Play"
        sub="Practice vs bots · no stake"
        onPress={() => navigation.navigate("WebGame", { gameId: "ludo", title: "Ludo" })}
      />
      <ActionTile icon="plus-box" title="Create private" offline={server.state === "down"} sub="Pick players, share a code with friends" onPress={() => navigation.navigate("LudoCreateRoom")} />
      <ActionTile icon="key-variant" title="Join with code" offline={server.state === "down"} sub="Enter a 6-character table code" onPress={() => navigation.navigate("LudoJoinRoom")} />
      <ActionTile icon="lightning-bolt" title="Quick match" offline={server.state === "down"} sub="Get paired with real players" onPress={() => navigation.navigate("LudoRandomMatch")} />

      <View style={styles.recentHead}>
        <Label>Recent matches</Label>
        <Pressable onPress={() => navigation.navigate("HomeStack", { screen: "Wallet" })} hitSlop={8}>
          <Text style={styles.link}>Wallet & history</Text>
        </Pressable>
      </View>
      {recent.length === 0 ? (
        <Glass style={styles.empty}>
          <Text style={styles.emptyTitle}>{history.status === "loading" ? "Loading matches…" : "No matches yet"}</Text>
          {history.status === "offline" ? (
            <Muted style={{ textAlign: "center" }}>Can't reach the match server right now.</Muted>
          ) : null}
          {history.status !== "loading" ? (
            <PrimaryButton icon="dice-5" label="Play Ludo" onPress={() => navigation.navigate("LudoRandomMatch")} />
          ) : null}
        </Glass>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {recent.map((m) => (
            <Pressable key={m.id} onPress={() => navigation.navigate("HomeStack", { screen: "Wallet" })}>
              <Glass style={styles.recent}>
                {m.stake > 0 ? (
                  <Text style={[styles.delta, { color: m.delta >= 0 ? "#34D399" : "#F87171" }]}>
                    {m.delta >= 0 ? "+" : ""}
                    {m.delta.toFixed(2)}
                  </Text>
                ) : (
                  <Text style={[styles.delta, { color: m.result === "won" ? "#34D399" : aura.textMuted }]}>
                    {m.result === "won" ? "Won" : m.place ? `#${m.place}` : "Lost"}
                  </Text>
                )}
                <Muted>{m.players}P · {m.stake > 0 ? `${m.stake} USDC` : "No stake"}</Muted>
                <Muted style={{ fontSize: 11 }}>{whenLabel(m.endedAt)}</Muted>
              </Glass>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </LudoScreen>
  );
}

const styles = StyleSheet.create({
  serverPill: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  serverText: { color: aura.textMuted, fontSize: 12, flex: 1 },
  recentHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  link: { color: aura.purpleBright, fontWeight: "700" },
  recent: { width: 132, gap: 2, padding: 14 },
  delta: { fontSize: 18, fontWeight: "800" },
  empty: { padding: 16, gap: 10, alignItems: "stretch" },
  emptyTitle: { color: aura.text, fontWeight: "800", fontSize: 16, textAlign: "center" },
});

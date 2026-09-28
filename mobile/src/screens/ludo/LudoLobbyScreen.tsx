import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Share, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import * as Clipboard from "expo-clipboard";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { aura } from "../../theme/tokens";
import { GhostButton, Glass, Label, LudoScreen, Muted, PrimaryButton, SeatGrid, SummaryRow } from "./ludoUi";
import { modeFor, payoutFor, usePlayerName } from "./ludoShared";
import { matchClient, MatchState } from "../../match/MatchClient";

export type LudoLobbyParams = {
  mode: "create" | "join";
  roomCode: string;
  players: number;
  stake: number;
};

type Phase = "connecting" | "seated" | "unreachable" | "not_found" | "full" | "exists" | "lost" | "forfeited";

/**
 * Real pre-game lobby. Seats come only from the server's room.state; the
 * match starts on the server when every seat has a real player.
 */
export function LudoLobbyScreen() {
  const navigation = useNavigation<any>();
  const { mode, roomCode, players, stake } = useRoute<any>().params as LudoLobbyParams;
  const playerName = usePlayerName();
  const [phase, setPhase] = useState<Phase>("connecting");
  const [room, setRoom] = useState<MatchState | null>(null);
  const [mySeat, setMySeat] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    let live = true;
    setPhase("connecting");
    const unsub = matchClient.on("*", (msg: any) => {
      if (!live) return;
      if ((msg.type === "room.created" || msg.type === "room.joined") && msg.roomCode === roomCode) {
        setMySeat(msg.seat);
        setRoom(msg.state);
        setPhase("seated");
      } else if (msg.type === "room.state" && msg.state?.roomCode === roomCode) {
        setRoom(msg.state);
      } else if (msg.type === "match.started") {
        startedRef.current = true;
        navigation.replace("WebGame", {
          gameId: "ludo",
          title: "Ludo",
          roomCode,
          mode,
          players: msg.state?.seats?.length ?? players,
          stake: String(stake),
        });
      } else if (msg.type === "error") {
        if (msg.error === "room_not_found") setPhase("not_found");
        else if (msg.error === "room_full") setPhase("full");
        else if (msg.error === "room_exists") setPhase("exists");
        else if (msg.error === "forfeited") setPhase("forfeited");
      }
    });
    const unsubDrop = matchClient.on("disconnected", () => live && setPhase("lost"));

    (async () => {
      const ok = await matchClient.connect();
      if (!live) return;
      if (!ok) return setPhase("unreachable");
      if (matchClient.currentRoomCode === roomCode && matchClient.currentState) {
        setRoom(matchClient.currentState);
        setMySeat(matchClient.mySeat);
        setPhase("seated");
      } else if (mode === "create" && attempt === 0) {
        if (matchClient.currentRoomCode) matchClient.leaveRoom();
        matchClient.createRoom(roomCode, modeFor(players), playerName, stake);
      } else {
        // Join, or Retry after a drop: same playerId takes the held seat back.
        if (matchClient.currentRoomCode && matchClient.currentRoomCode !== roomCode) matchClient.leaveRoom();
        matchClient.joinRoom(roomCode, playerName);
      }
    })();

    return () => {
      live = false;
      unsub();
      unsubDrop();
    };
  }, [roomCode, mode, players, stake, playerName, attempt, navigation]);

  // Leaving the lobby frees the seat (unless we handed off to the board).
  useEffect(
    () => () => {
      if (!startedRef.current && matchClient.currentRoomCode === roomCode) matchClient.leaveRoom();
    },
    [roomCode]
  );

  const seats = room?.seats ?? [];
  const seated = room ? Object.keys(room.players ?? {}).length : 0;
  const total = room?.maxPlayers ?? players;

  if (phase !== "seated" && phase !== "connecting") {
    const title =
      phase === "not_found" ? "Table not found" : phase === "full" ? "Table is full" : phase === "exists" ? "Table code in use" : phase === "forfeited" ? "You forfeited this match" : phase === "lost" ? "Connection lost" : "Can't reach match server";
    const body =
      phase === "not_found"
        ? `No open table uses ${roomCode}. The host may have left.`
        : phase === "full"
          ? "Every seat is taken, or the match already started."
          : phase === "exists"
            ? "Another table already uses this code. Go back and create a new one."
            : phase === "forfeited"
              ? "Your seat at this table is gone. Start a new match from the hub."
            : phase === "lost"
              ? "The connection to the match server dropped. Retry to get back to your table."
              : "Check you're on the same network as the match server, then retry.";
    const canRetry = phase === "unreachable" || phase === "lost";
    return (
      <LudoScreen
        title="Lobby"
        toHub
        footer={
          <>
            {canRetry ? <PrimaryButton icon="refresh" label="Retry" onPress={() => setAttempt((n) => n + 1)} /> : null}
            <GhostButton label="Back to hub" onPress={() => navigation.navigate("LudoHub")} />
          </>
        }
      >
        <Glass style={{ gap: 6 }}>
          <Text style={styles.title}>{title}</Text>
          <Muted>{body}</Muted>
        </Glass>
      </LudoScreen>
    );
  }

  return (
    <LudoScreen
      title="Lobby"
      toHub
      footer={
        <>
          <PrimaryButton
            icon="account-clock"
            label={phase === "connecting" ? "Connecting…" : `Waiting for players · ${seated}/${total}`}
            disabled
            onPress={() => {}}
          />
          {phase !== "connecting" ? (
            <Muted style={{ textAlign: "center", fontSize: 12 }}>
              Real players only, no bots. Share the code so a second phone can join, then moves sync live.
            </Muted>
          ) : null}
          <GhostButton label="Leave table" onPress={() => navigation.navigate("LudoHub")} />
        </>
      }
    >
      <Glass>
        <Label>Invite code</Label>
        <View style={styles.codeRow}>
          <Text style={styles.code}>{roomCode}</Text>
          <Pressable
            hitSlop={8}
            onPress={async () => {
              await Clipboard.setStringAsync(roomCode);
              setCopied(true);
            }}
            style={styles.copy}
          >
            <Icon name={copied ? "check" : "content-copy"} size={18} color={aura.purpleBright} />
            <Text style={styles.copyText}>{copied ? "Copied" : "Copy"}</Text>
          </Pressable>
        </View>
      </Glass>

      <Label>Players · {seated}/{total} seated</Label>
      {phase === "connecting" || !room ? (
        <ActivityIndicator color={aura.purpleBright} style={{ paddingVertical: 24 }} />
      ) : (
        <SeatGrid
          seats={seats}
          players={room.players ?? {}}
          mySeat={mySeat}
          onShareCode={() => Share.share({ message: `Join my Ludo table on Aura with code ${roomCode}` }).catch(() => {})}
        />
      )}

      <Glass>
        {stake > 0 ? (
          <>
            <SummaryRow k="Stake per player" v={`${stake} USDC`} />
            <SummaryRow k="Winner takes" v={`${payoutFor(stake, total).payout} USDC`} strong />
          </>
        ) : (
          <SummaryRow k="Stake" v="Friendly · no stake" strong />
        )}
      </Glass>
      <Muted style={{ fontSize: 12, textAlign: "center" }}>The match starts on its own once every seat is filled.</Muted>
    </LudoScreen>
  );
}

const styles = StyleSheet.create({
  codeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  code: { color: aura.text, fontSize: 28, fontWeight: "800", letterSpacing: 6 },
  copy: { flexDirection: "row", alignItems: "center", gap: 6 },
  copyText: { color: aura.purpleBright, fontWeight: "700" },
  title: { color: aura.text, fontSize: 18, fontWeight: "800" },
});

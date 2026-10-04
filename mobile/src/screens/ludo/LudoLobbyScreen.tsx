import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Share, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import * as Clipboard from "expo-clipboard";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { aura } from "../../theme/tokens";
import { Big, GhostButton, Glass, Label, LudoScreen, Muted, PrimaryButton, SeatGrid, SummaryRow } from "./ludoUi";
import { modeFor, payoutFor, usePlayerName } from "./ludoShared";
import { matchClient, MatchState, REFUND_REASON_TEXT, RefundNotice } from "../../match/MatchClient";
import { DepositSheet } from "./DepositSheet";

export type LudoLobbyParams = {
  mode: "create" | "join";
  roomCode: string;
  players: number;
  stake: number;
};

type Phase = "connecting" | "seated" | "unreachable" | "not_found" | "full" | "exists" | "lost" | "forfeited" | "refunded" | "staked_error";

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
  const [refund, setRefund] = useState<RefundNotice | null>(null);
  const [stakeError, setStakeError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const closeSheet = useCallback(() => setSheetOpen(false), []);

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
      } else if (msg.type === "escrow.refunded" && msg.roomCode === roomCode) {
        setRefund({ ...msg, refunded: msg.refunded ?? [], at: Date.now() });
        setSheetOpen(false);
        setPhase("refunded");
      } else if (msg.type === "error") {
        if (["wallet_required", "bad_stake", "escrow_unavailable", "wallet_in_use"].includes(msg.error)) {
          setStakeError(msg.message || "This table can't take stakes right now.");
          setPhase("staked_error");
        } else if (msg.error === "room_not_found") setPhase("not_found");
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

  const esc = stake > 0 ? room?.escrow : undefined;
  const mine = esc && mySeat != null ? esc.seats[mySeat]?.state : undefined;
  // Deposit countdown (host sees when unfunded seats time out and everyone is refunded).
  useEffect(() => {
    if (esc?.phase !== "depositing") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [esc?.phase]);
  const secsLeft = esc?.depositDeadline ? Math.max(0, Math.round((esc.depositDeadline - now) / 1000)) : null;
  const unfunded = esc ? Object.values(esc.seats).filter((x) => x.state !== "ready").length : 0;

  const seats = room?.seats ?? [];
  const seated = room ? Object.keys(room.players ?? {}).length : 0;
  const total = room?.maxPlayers ?? players;
  const prize = payoutFor(stake, total);
  const winnerTakes = esc?.payout ?? prize.payout;

  if (phase === "refunded" && refund) {
    const why = REFUND_REASON_TEXT[refund.reason] ?? "table closed";
    const mineBack = !!matchClient.wallet && refund.refunded.includes(matchClient.wallet);
    return (
      <LudoScreen title="Lobby" toHub footer={<PrimaryButton label="Back to hub" onPress={() => navigation.navigate("LudoHub")} />}>
        <Glass style={{ gap: 8 }}>
          <Text style={styles.title}>{mineBack ? `${refund.stake} USDC refunded` : "Table closed"}</Text>
          <Muted>
            {mineBack ? `Your stake is back in your wallet · ${why}.` : `The match didn't start · ${why}. Nothing was taken from you.`}
          </Muted>
          {refund.error ? <Muted style={{ fontSize: 12 }}>{refund.error}</Muted> : null}
          {refund.url ? (
            <Pressable onPress={() => Linking.openURL(refund.url as string)} style={styles.copy} accessibilityRole="link">
              <Icon name="open-in-new" size={16} color={aura.purpleBright} />
              <Text style={styles.copyText}>View refund on explorer</Text>
            </Pressable>
          ) : null}
        </Glass>
      </LudoScreen>
    );
  }

  if (phase !== "seated" && phase !== "connecting") {
    const title =
      phase === "not_found" ? "Table not found" : phase === "full" ? "Table is full" : phase === "exists" ? "Table code in use" : phase === "forfeited" ? "You forfeited this match" : phase === "staked_error" ? "Can't join this staked table" : phase === "lost" ? "Connection lost" : "Can't reach match server";
    const body =
      phase === "not_found"
        ? `No open table uses ${roomCode}. The host may have left.`
        : phase === "full"
          ? "Every seat is taken, or the match already started."
          : phase === "exists"
            ? "Another table already uses this code. Go back and create a new one."
            : phase === "staked_error"
              ? stakeError ?? "This table can't take stakes right now."
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
          {esc && esc.phase === "depositing" && mine !== "ready" ? (
            <PrimaryButton icon="lock" label={`Lock ${stake} USDC`} onPress={() => setSheetOpen(true)} />
          ) : (
            <PrimaryButton
              icon={mine === "ready" ? "check-circle" : "account-clock"}
              label={
                phase === "connecting"
                  ? "Connecting…"
                  : esc?.phase === "initializing"
                    ? "Opening the table vault…"
                    : esc?.phase === "locked"
                      ? "All stakes locked · starting…"
                      : mine === "ready"
                        ? `Locked ✓ · waiting for ${unfunded} more`
                        : `Waiting for players · ${seated}/${total}`
              }
              disabled
              onPress={() => {}}
            />
          )}
          {phase !== "connecting" ? (
            <Muted style={{ textAlign: "center", fontSize: 12 }}>
              Real players only, no bots. Share the code so a second phone can join, then moves sync live.
            </Muted>
          ) : null}
          <GhostButton label="Leave table" onPress={() => navigation.navigate("LudoHub")} />
        </>
      }
    >
      <Glass style={{ gap: 8 }}>
        <Label>Invite code</Label>
        <Text style={styles.code}>{roomCode}</Text>
        <Big style={{ fontSize: 22 }}>{stake > 0 ? `Winner takes ${winnerTakes} USDC` : "Friendly"}</Big>
        <Muted>
          {stake > 0
            ? `${stake} USDC each · pot ${esc?.pot ?? prize.pot} USDC · 5% fee`
            : "No stake. The match starts when every seat is filled."}
        </Muted>
        {stake > 0 ? (
          <>
            <SummaryRow k="Your stake" v={`${stake} USDC`} />
            <SummaryRow k="Fee (5%)" v={`${esc?.fee ?? prize.fee} USDC`} />
            <SummaryRow k="Paid to winner" v={`${winnerTakes} USDC`} strong />
          </>
        ) : null}
        <View style={styles.codeActions}>
          <Pressable
            hitSlop={8}
            onPress={async () => {
              await Clipboard.setStringAsync(roomCode);
              setCopied(true);
            }}
            style={styles.copy}
            accessibilityRole="button"
          >
            <Icon name={copied ? "check" : "content-copy"} size={18} color={aura.purpleBright} />
            <Text style={styles.copyText}>{copied ? "Copied" : "Copy code"}</Text>
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={() =>
              Share.share({
                message: stake > 0
                  ? `Join my Ludo table on Aura. Code ${roomCode}. ${stake} USDC each, winner takes ${winnerTakes} USDC.`
                  : `Join my Ludo table on Aura. Code ${roomCode}. Friendly, no stake.`,
              }).catch(() => {})
            }
            style={styles.copy}
            accessibilityRole="button"
          >
            <Icon name="share-variant" size={18} color={aura.purpleBright} />
            <Text style={styles.copyText}>Share</Text>
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
          escrowSeats={esc && esc.phase !== "filling" ? esc.seats : undefined}
          onShareCode={() =>
            Share.share({
              message: stake > 0
                ? `Join my Ludo table on Aura. Code ${roomCode}. ${stake} USDC each.`
                : `Join my Ludo table on Aura with code ${roomCode}`,
            }).catch(() => {})
          }
        />
      )}
      {esc?.phase === "depositing" && secsLeft != null ? (
        <Muted style={{ fontSize: 12, textAlign: "center" }}>
          {unfunded > 0
            ? `${unfunded} seat${unfunded === 1 ? "" : "s"} still to lock · table closes in ${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, "0")} and every stake is refunded`
            : "Every stake is locked."}
        </Muted>
      ) : (
        <Muted style={{ fontSize: 12, textAlign: "center" }}>
          {stake > 0 ? "Once every seat is filled, each player locks their stake, then the match starts." : "The match starts on its own once every seat is filled."}
        </Muted>
      )}
      {esc ? <DepositSheet
          visible={sheetOpen}
          escrow={esc}
          mySeat={mySeat}
          onClose={closeSheet}
          onLeave={() => {
            setSheetOpen(false);
            navigation.navigate("LudoHub"); // unmount leaves the table → server refunds any deposits
          }}
        /> : null}
    </LudoScreen>
  );
}

const styles = StyleSheet.create({
  code: { color: aura.text, fontSize: 32, fontWeight: "800", letterSpacing: 6 },
  codeActions: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 4 },
  copy: { flexDirection: "row", alignItems: "center", gap: 6 },
  copyText: { color: aura.purpleBright, fontWeight: "700" },
  title: { color: aura.text, fontSize: 18, fontWeight: "800" },
});

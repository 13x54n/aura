import React, { useCallback, useEffect, useState } from "react";
import { BackHandler, Linking, Pressable, Share, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { aura } from "../../theme/tokens";
import { Big, GhostButton, Glass, Label, LudoScreen, Muted, PrimaryButton, SummaryRow } from "./ludoUi";
import { BOARD_SEAT_COLORS, payoutFor } from "./ludoShared";
import { matchClient, Payout } from "../../match/MatchClient";

export type LudoResultParams = {
  mode?: "create" | "join" | "random";
  won: boolean;
  winnerName?: string;
  roomCode?: string;
  stake?: number;
  players?: number;
};

/** Winner / payout (wireframe 7): result · receipt · standings · Share / Play again. */
export function LudoResultScreen() {
  const navigation = useNavigation<any>();
  const p = (useRoute<any>().params ?? {}) as LudoResultParams;
  const stake = p.stake ?? 0;
  const players = p.players ?? 4;
  const est = payoutFor(stake, players);
  const done0 = matchClient.lastCompleted;
  const forThisTable = !!done0 && (!p.roomCode || done0.roomCode === p.roomCode);
  // Real on-chain payout from the server's settle (late settles arrive as escrow.settled).
  const [chain, setChain] = useState<Payout | null>(forThisTable ? done0?.payout ?? null : null);
  useEffect(
    () => matchClient.on("escrow.settled", (m: any) => (!p.roomCode || m.roomCode === p.roomCode) && m.payout && setChain(m.payout)),
    [p.roomCode]
  );
  const pot = chain?.pot ?? est.pot;
  const fee = chain?.fee ?? est.fee;
  const payout = chain?.amount ?? est.payout;
  // Android back / Close → Ludo hub, never back into Create/Join.
  const toHub = useCallback(() => {
    navigation.navigate("LudoHub");
    return true;
  }, [navigation]);
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", toHub);
      return () => sub.remove();
    }, [toHub])
  );

  // Play again repeats the same mode, with the Ludo hub underneath.
  const playAgain = () => {
    const target = p.mode === "create" ? "LudoCreateRoom" : p.mode === "join" ? "LudoJoinRoom" : "LudoRandomMatch";
    const st = navigation.getState();
    const hubIdx = st.routes.findIndex((r: any) => r.name === "LudoHub");
    if (hubIdx < 0) {
      navigation.replace(target);
      return;
    }
    navigation.reset({ index: hubIdx + 1, routes: [...st.routes.slice(0, hubIdx + 1), { name: target }] });
  };

  // Real standings from the server's match.completed for this table only.
  const done = matchClient.lastCompleted;
  const standings = done && (!p.roomCode || done.roomCode === p.roomCode) ? done.standings : [];
  const mySeat = matchClient.mySeat;

  return (
    <LudoScreen
      title="Result"
      toHub
      footer={
        <>
          <PrimaryButton icon="replay" label="Play again" onPress={playAgain} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <GhostButton
                label="Share"
                onPress={() =>
                  Share.share({
                    message: p.won
                      ? stake > 0
                        ? `I won ${payout} USDC in a Ludo match on Aura.`
                        : `I won a friendly Ludo match on Aura.`
                      : `Just played Ludo on Aura.`,
                  }).catch(() => {})
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <GhostButton label="Back to hub" onPress={() => navigation.navigate("LudoHub")} />
            </View>
          </View>
        </>
      }
    >
      <Glass style={styles.hero}>
        <Icon name={p.won ? "check-decagram" : "dice-multiple"} size={48} color={aura.purpleBright} />
        {stake > 0 ? (
          p.won ? (
            <>
              <Big>You won</Big>
              <Muted>{payout} USDC paid to your wallet</Muted>
            </>
          ) : (
            <>
              <Big>Match over</Big>
              <Muted>
                {p.winnerName ?? "Opponent"} won {payout} USDC · you staked {stake} USDC
              </Muted>
            </>
          )
        ) : (
          <>
            <Big>{p.won ? "You won" : `${p.winnerName ?? "Opponent"} won`}</Big>
            <Muted>Friendly · no stake</Muted>
          </>
        )}
      </Glass>

      {stake > 0 ? (
        <Glass>
          <Label>Receipt{p.roomCode ? ` · ${p.roomCode}` : ""}</Label>
          <SummaryRow k="Pot" v={`${pot} USDC`} />
          <SummaryRow k="House fee (5%)" v={`${fee} USDC`} />
          <SummaryRow k="Paid to winner" v={`${payout} USDC`} strong />
          {chain?.url ? (
            <Pressable onPress={() => Linking.openURL(chain.url as string)} style={styles.link} accessibilityRole="link">
              <Icon name="open-in-new" size={14} color={aura.purpleBright} />
              <Text style={styles.linkText}>View on explorer</Text>
            </Pressable>
          ) : (
            <Muted style={{ fontSize: 12, marginTop: 6 }}>Payout is confirming on-chain…</Muted>
          )}
          {chain?.resultHash ? (
            <Muted style={{ fontSize: 10, marginTop: 6 }}>Proof {chain.resultHash.slice(0, 24)}…</Muted>
          ) : null}
        </Glass>
      ) : null}

      {standings.length > 0 ? (
        <Glass>
          <Label>Standings</Label>
          {standings.map((st) => {
            const you = st.seat === mySeat;
            return (
              <View key={st.seat} style={styles.stand}>
                <Text style={styles.rank}>{st.place}</Text>
                <View style={[styles.dot, { backgroundColor: BOARD_SEAT_COLORS[st.seat] ?? aura.purple }]} />
                <Text style={[styles.name, you && { color: aura.purpleBright }]}>
                  {st.name}
                  {you ? " (you)" : ""}
                </Text>
                {st.forfeited ? <Muted style={{ marginLeft: "auto", fontSize: 12 }}>Left</Muted> : null}
              </View>
            );
          })}
        </Glass>
      ) : null}
    </LudoScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 8, paddingVertical: 28 },
  amount: { fontSize: 22, fontWeight: "800" },
  stand: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  rank: { color: aura.textDim, width: 16, fontWeight: "800" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { color: aura.text, fontWeight: "700" },
  link: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  linkText: { color: aura.purpleBright, fontWeight: "700" },
});

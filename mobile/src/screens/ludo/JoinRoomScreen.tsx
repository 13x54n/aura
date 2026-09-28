import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, TextInput, View } from "react-native";
import { Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { aura } from "../../theme/tokens";
import { Glass, Label, LudoScreen, Muted, PrimaryButton, SummaryRow } from "./ludoUi";
import { payoutFor } from "./ludoShared";
import { matchClient, RoomInfo } from "../../match/MatchClient";

type Lookup =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "found"; info: RoomInfo }
  | { state: "not_found" }
  | { state: "offline" };

/** Join by code: the table card is the server's real table for that code. */
export function JoinRoomScreen() {
  const navigation = useNavigation<any>();
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });

  useEffect(() => {
    if (code.length !== 6) {
      setLookup({ state: "idle" });
      return;
    }
    let live = true;
    setLookup({ state: "loading" });
    matchClient.peekRoom(code).then((r) => {
      if (!live) return;
      if (!r) setLookup({ state: "offline" });
      else if ("error" in r) setLookup({ state: "not_found" });
      else setLookup({ state: "found", info: r });
    });
    return () => {
      live = false;
    };
  }, [code]);

  const info = lookup.state === "found" ? lookup.info : null;
  const joinable = !!info && info.status === "waiting" && info.seated < info.maxPlayers;

  return (
    <LudoScreen
      title="Join by code"
      toHub
      footer={
        <PrimaryButton
          icon="seat"
          label="Join table"
          disabled={!joinable}
          onPress={() =>
            navigation.navigate("LudoLobby", {
              mode: "join",
              roomCode: info!.roomCode,
              players: info!.maxPlayers,
              stake: info!.stake,
            })
          }
        />
      }
    >
      <Glass style={{ gap: 10 }}>
        <Label>Table code</Label>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          placeholder="ABC123"
          placeholderTextColor={aura.textDim}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={styles.code}
        />
        <Muted>Ask the host for their 6-character code.</Muted>
      </Glass>

      {lookup.state === "loading" ? <ActivityIndicator color={aura.purpleBright} /> : null}

      {lookup.state === "not_found" ? (
        <Glass>
          <Text style={styles.title}>Table not found</Text>
          <Muted>No open table uses {code}. Check the code with the host.</Muted>
        </Glass>
      ) : null}

      {lookup.state === "offline" ? (
        <Glass>
          <Text style={styles.title}>Can't reach match server</Text>
          <Muted>Check you're on the same network as the server, then edit the code to retry.</Muted>
        </Glass>
      ) : null}

      {info ? (
        <Glass>
          <View style={styles.head}>
            <Text style={styles.title}>{info.host ? `${info.host}'s table` : "Table"}</Text>
            <Text style={styles.badge}>{info.roomCode}</Text>
          </View>
          <SummaryRow k="Seats" v={`${info.seated}/${info.maxPlayers} filled`} />
          {info.stake > 0 ? (
            <>
              <SummaryRow k="Stake per player" v={`${info.stake} USDC`} />
              <SummaryRow k="Winner takes" v={`${payoutFor(info.stake, info.maxPlayers).payout} USDC`} strong />
            </>
          ) : (
            <SummaryRow k="Stake" v="Friendly · no stake" strong />
          )}
          {info.status !== "waiting" ? (
            <Muted style={{ marginTop: 6 }}>This match already started.</Muted>
          ) : info.seated >= info.maxPlayers ? (
            <Muted style={{ marginTop: 6 }}>Every seat is taken.</Muted>
          ) : null}
        </Glass>
      ) : null}
    </LudoScreen>
  );
}

const styles = StyleSheet.create({
  code: {
    color: aura.text,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 10,
    textAlign: "center",
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: aura.chipIdle,
  },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  title: { color: aura.text, fontSize: 17, fontWeight: "800" },
  badge: { color: aura.purpleBright, fontWeight: "800", letterSpacing: 2 },
});

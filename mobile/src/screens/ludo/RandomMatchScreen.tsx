import React, { useEffect, useRef, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { GhostButton, Glass, Label, LudoScreen, Muted, PrimaryButton, PulseRing, Segmented, StakeChips, SummaryRow } from "./ludoUi";
import { modeFor, payoutFor, usePlayerName } from "./ludoShared";
import { matchClient } from "../../match/MatchClient";

const PATIENCE_MS = 60_000;

type Phase = "pick" | "finding" | "slow" | "matched" | "unreachable";

/**
 * Quick match: a real server queue by player count + stake. "Finding a table…"
 * stays up until real opponents join. Never fills seats with bots.
 */
export function RandomMatchScreen() {
  const navigation = useNavigation<any>();
  const playerName = usePlayerName();
  const [players, setPlayers] = useState<2 | 3 | 4>(2);
  const [stake, setStake] = useState(0);
  const [phase, setPhase] = useState<Phase>("pick");
  const [waiting, setWaiting] = useState(0);
  const patience = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomRef = useRef<string | null>(null);
  const handedOff = useRef(false);

  const clearPatience = () => {
    if (patience.current) clearTimeout(patience.current);
    patience.current = null;
  };
  const armPatience = () => {
    clearPatience();
    patience.current = setTimeout(() => setPhase((p) => (p === "finding" ? "slow" : p)), PATIENCE_MS);
  };

  useEffect(() => {
    const unsub = matchClient.on("*", (msg: any) => {
      if (msg.type === "queue.waiting") setWaiting(msg.waiting ?? 0);
      if (msg.type === "room.joined" && String(msg.roomCode).startsWith("RND-")) {
        clearPatience();
        roomRef.current = msg.roomCode;
        setPhase("matched");
        if (stake > 0) {
          // Staked quick match: everyone locks their stake in the lobby before the first roll.
          handedOff.current = true;
          navigation.replace("LudoLobby", { mode: "join", roomCode: msg.roomCode, players, stake });
        }
      }
      if (msg.type === "match.started" && roomRef.current) {
        handedOff.current = true;
        navigation.replace("WebGame", {
          gameId: "ludo",
          title: "Ludo",
          roomCode: roomRef.current,
          mode: "random",
          players: msg.state?.seats?.length ?? players,
          stake: String(stake),
        });
      }
    });
    const unsubDrop = matchClient.on("disconnected", () => {
      clearPatience();
      setPhase((p) => (p === "pick" ? p : "unreachable"));
    });
    return () => {
      unsub();
      unsubDrop();
      clearPatience();
      // Leaving the screen takes us out of the queue (or the unstarted table).
      if (!handedOff.current) {
        matchClient.leaveQueue();
        if (roomRef.current && matchClient.currentRoomCode === roomRef.current) matchClient.leaveRoom();
      }
    };
  }, [navigation, players, stake]);

  const find = async () => {
    setPhase("finding");
    setWaiting(0);
    const ok = await matchClient.connect();
    if (!ok) return setPhase("unreachable");
    if (matchClient.currentRoomCode) matchClient.leaveRoom();
    matchClient.joinRandom(playerName, players, stake);
    armPatience();
  };

  const cancel = () => {
    clearPatience();
    matchClient.leaveQueue();
    setPhase("pick");
  };

  if (phase === "finding" || phase === "slow" || phase === "matched") {
    return (
      <LudoScreen
        title="Quick match"
        toHub
        footer={
          phase === "slow" ? (
            <>
              <PrimaryButton
                icon="timer-sand"
                label="Keep waiting"
                onPress={() => {
                  setPhase("finding");
                  armPatience();
                }}
              />
              <GhostButton
                label="Back to hub"
                onPress={() => {
                  matchClient.leaveQueue();
                  navigation.navigate("LudoHub");
                }}
              />
            </>
          ) : phase === "finding" ? (
            <GhostButton label="Cancel" onPress={cancel} />
          ) : undefined
        }
      >
        <PulseRing label={phase === "matched" ? "Table found · starting…" : "Finding a table…"} />
        <Muted style={{ textAlign: "center" }}>
          {players} players · {stake > 0 ? `${stake} USDC stake` : "Friendly · no stake"}
        </Muted>
        {phase !== "matched" && waiting > 0 ? (
          <Muted style={{ textAlign: "center", fontSize: 12 }}>
            {waiting} of {players} players in line
          </Muted>
        ) : null}
        {phase === "slow" ? (
          <Glass>
            <Muted>No one else has joined yet. Keep waiting, or head back and invite a friend with a private code.</Muted>
          </Glass>
        ) : null}
      </LudoScreen>
    );
  }

  return (
    <LudoScreen
      title="Quick match"
      toHub
      footer={<PrimaryButton icon="lightning-bolt" label="Find table" onPress={find} />}
    >
      {phase === "unreachable" ? (
        <Glass>
          <Label>Can't reach match server</Label>
          <Muted style={{ marginTop: 6 }}>Check you're on the same network as the server, then try again.</Muted>
        </Glass>
      ) : null}
      <Glass style={{ gap: 10 }}>
        <Label>Players</Label>
        <Segmented options={[2, 3, 4] as const} value={players} onChange={setPlayers} format={(v) => `${v} players`} />
      </Glass>
      <Glass style={{ gap: 10 }}>
        <Label>Stake</Label>
        <StakeChips value={stake} onChange={setStake} />
      </Glass>
      <Glass>
        <SummaryRow k="Table" v={`${modeFor(players)} · real players only`} />
        {stake > 0 ? (
          <SummaryRow k="Winner takes" v={`${payoutFor(stake, players).payout} USDC`} strong />
        ) : (
          <SummaryRow k="Stake" v="Friendly · no stake" strong />
        )}
      </Glass>
    </LudoScreen>
  );
}

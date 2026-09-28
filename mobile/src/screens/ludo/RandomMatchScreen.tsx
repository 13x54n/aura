import React, { useEffect, useRef, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { GhostButton, Glass, Label, LudoScreen, Muted, PrimaryButton, PulseRing, StakeChips, SummaryRow } from "./ludoUi";
import { payoutFor } from "./ludoMock";

/** Quick match (wireframe 4): stake chips → finding-table ring → lobby. */
export function RandomMatchScreen() {
  const navigation = useNavigation<any>();
  const [stake, setStake] = useState(1);
  const [finding, setFinding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const find = () => {
    setFinding(true);
    // Mock matchmaking delay until the rooms backend exists.
    timer.current = setTimeout(() => {
      setFinding(false);
      navigation.replace("LudoLobby", {
        mode: "random",
        roomCode: "RND-" + Math.floor(1000 + Math.random() * 9000),
        players: 4,
        stake,
        visibility: "Public",
      });
    }, 2200);
  };

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    setFinding(false);
  };

  if (finding) {
    return (
      <LudoScreen title="Quick match" footer={<GhostButton label="Cancel" onPress={cancel} />}>
        <PulseRing label="Finding a table…" />
        <Muted style={{ textAlign: "center" }}>{stake} USDC stake · 4 players</Muted>
      </LudoScreen>
    );
  }

  return (
    <LudoScreen title="Quick match" footer={<PrimaryButton icon="lightning-bolt" label="Find table" onPress={find} />}>
      <Glass style={{ gap: 10 }}>
        <Label>Stake</Label>
        <StakeChips value={stake} onChange={setStake} />
      </Glass>
      <Glass>
        <SummaryRow k="Players" v="4" />
        <SummaryRow k="Winner takes" v={`${payoutFor(stake, 4).payout} USDC`} strong />
      </Glass>
    </LudoScreen>
  );
}

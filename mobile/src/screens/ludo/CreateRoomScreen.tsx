import React, { useMemo, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { Glass, Label, LudoScreen, PrimaryButton, Segmented, StakeChips, SummaryRow } from "./ludoUi";
import { mockCode, payoutFor } from "./ludoMock";

/** Create match (wireframe 2): players · stake · visibility · summary. */
export function CreateRoomScreen() {
  const navigation = useNavigation<any>();
  const [players, setPlayers] = useState<2 | 3 | 4>(4);
  const [stake, setStake] = useState(5);
  const [visibility, setVisibility] = useState<"Private" | "Public">("Private");
  const { pot, fee, payout } = useMemo(() => payoutFor(stake, players), [stake, players]);

  return (
    <LudoScreen
      title="Create match"
      toHub
      footer={
        <PrimaryButton
          icon="lock"
          label="Create table · Lock"
          onPress={() =>
            navigation.navigate("LudoLobby", {
              mode: "create",
              roomCode: mockCode(),
              players,
              stake,
              visibility,
            })
          }
        />
      }
    >
      <Glass style={{ gap: 10 }}>
        <Label>Players</Label>
        <Segmented options={[2, 3, 4] as const} value={players} onChange={setPlayers} format={(v) => `${v} players`} />
      </Glass>
      <Glass style={{ gap: 10 }}>
        <Label>Stake per player</Label>
        <StakeChips value={stake} onChange={setStake} />
      </Glass>
      <Glass style={{ gap: 10 }}>
        <Label>Visibility</Label>
        <Segmented options={["Private", "Public"] as const} value={visibility} onChange={setVisibility} />
      </Glass>
      <Glass>
        <Label>Summary</Label>
        <SummaryRow k="Your stake" v={`${stake} USDC`} />
        <SummaryRow k="Pot" v={`${pot} USDC`} />
        <SummaryRow k="House fee (5%)" v={`${fee} USDC`} />
        <SummaryRow k="Winner takes" v={`${payout} USDC`} strong />
      </Glass>
    </LudoScreen>
  );
}

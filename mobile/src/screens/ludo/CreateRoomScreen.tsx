import React, { useMemo, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { Glass, Label, LudoScreen, Muted, PrimaryButton, Segmented, StakeChips, SummaryRow } from "./ludoUi";
import { newTableCode, payoutFor } from "./ludoShared";

/** Create a private table: players · stake (0 USDC friendly until escrow) · real lobby. */
export function CreateRoomScreen() {
  const navigation = useNavigation<any>();
  const [players, setPlayers] = useState<2 | 3 | 4>(2);
  const [stake, setStake] = useState(0);
  const { pot, fee, payout } = useMemo(() => payoutFor(stake, players), [stake, players]);

  return (
    <LudoScreen
      title="Create match"
      toHub
      footer={
        <PrimaryButton
          icon="table-furniture"
          label="Create table"
          onPress={() =>
            navigation.navigate("LudoLobby", { mode: "create", roomCode: newTableCode(), players, stake })
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
      <Glass>
        <Label>Summary</Label>
        <SummaryRow k="Seats" v={`${players} real players`} />
        {stake > 0 ? (
          <>
            <SummaryRow k="Your stake" v={`${stake} USDC`} />
            <SummaryRow k="Pot" v={`${pot} USDC`} />
            <SummaryRow k="House fee (5%)" v={`${fee} USDC`} />
            <SummaryRow k="Winner takes" v={`${payout} USDC`} strong />
          </>
        ) : (
          <SummaryRow k="Stake" v="Friendly · no stake" strong />
        )}
      </Glass>
      <Muted style={{ textAlign: "center", fontSize: 12 }}>
        You'll get a code to share. The match starts when every seat has a real player.
      </Muted>
    </LudoScreen>
  );
}

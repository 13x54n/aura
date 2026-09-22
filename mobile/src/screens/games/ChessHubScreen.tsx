import React from "react";
import { PlayableHubScreen } from "./PlayableHubScreen";

export function ChessHubScreen() {
  return (
    <PlayableHubScreen
      title="Chess"
      blurb="Pure skill escrow. Stake in → play → winner payout. Same PDA pattern as Ludo — board rules differ."
      badge="Playable"
    />
  );
}

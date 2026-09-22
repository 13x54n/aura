import React from "react";
import { PlayableHubScreen } from "./PlayableHubScreen";

export function SnakesHubScreen() {
  return (
    <PlayableHubScreen
      title="Snakes & Ladders"
      blurb="Skill + fair dice (commit-reveal / VRF). Stake in → play → winner payout. Same escrow rails as Ludo."
      badge="Playable"
    />
  );
}

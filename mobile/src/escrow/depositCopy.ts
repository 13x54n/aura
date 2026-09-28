/**
 * Deposit sheet copy (per design). Pure so unit tests can assert on it.
 * Rule: a spinner only while something is actually in flight; "Not approved" always
 * offers Try again + Leave table.
 */
import type { DepositStep } from "./depositFlow";

export const COPY = {
  opening: (stake: number) => `Opening Phantom to approve ${stake} USDC…`,
  confirming: "Confirming on Solana…",
  notApproved: "Not approved",
  reprompt: "That took too long, please approve once more",
  locked: "Locked ✓",
  approve: "Approve in Phantom",
} as const;

export type SheetView = {
  status: string | null;
  detail: string | null;
  spinner: boolean;
  primary: { label: string; action: "start" | "none" } | null;
  leave: boolean;
};

export function depositView(state: DepositStep | null, stake: number, chainLocked: boolean): SheetView {
  if (chainLocked) return { status: COPY.locked, detail: null, spinner: false, primary: null, leave: false };
  switch (state?.step) {
    case undefined:
      return { status: null, detail: null, spinner: false, primary: { label: COPY.approve, action: "start" }, leave: false };
    case "connecting":
    case "preparing":
      return { status: COPY.opening(stake), detail: null, spinner: true, primary: null, leave: false };
    case "wallet":
      return { status: state.retry ? COPY.reprompt : COPY.opening(stake), detail: null, spinner: true, primary: null, leave: false };
    case "sending":
    case "confirming":
    case "locked": // tx confirmed; Locked ✓ waits for the server's room-account read
      return { status: COPY.confirming, detail: null, spinner: true, primary: null, leave: false };
    case "cancelled":
      return { status: COPY.notApproved, detail: null, spinner: false, primary: { label: "Try again", action: "start" }, leave: true };
    case "error":
      return { status: COPY.notApproved, detail: state.message, spinner: false, primary: { label: "Try again", action: "start" }, leave: true };
  }
}

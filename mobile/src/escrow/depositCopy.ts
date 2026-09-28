/**
 * Deposit sheet copy (per design). Pure so unit tests can assert on it.
 * Rule: a spinner only while something is actually in flight; "Not approved" always
 * offers Try again + Leave table.
 */
import type { DepositStep } from "./depositFlow";

export const COPY = {
  preparing: "Preparing transaction…",
  opening: (stake: number) => `Opening Phantom to approve ${stake} USDC…`,
  confirming: "Confirming on Solana…",
  notApproved: "Not approved",
  slow: "Network is slow",
  startFailed: "Couldn't start the deposit. No USDC was moved.",
  reprompt: "That took too long, please approve once more",
  locked: "Locked ✓",
  approve: "Approve in Phantom",
} as const;

export type SheetView = {
  status: string | null;
  detail: string | null;
  spinner: boolean;
  /** The sheet's one purple button. Disabled while anything is in flight (no double deposit). */
  primary: { label: string; disabled: boolean } | null;
  leave: boolean;
};

const busy = (status: string, detail: string | null = null): SheetView => ({
  status, detail, spinner: true, primary: { label: COPY.approve, disabled: true }, leave: false,
});
const retry = (status: string, detail: string | null, leave: boolean): SheetView => ({
  status, detail, spinner: false, primary: { label: "Try again", disabled: false }, leave,
});

export function depositView(state: DepositStep | null, stake: number, chainLocked: boolean): SheetView {
  if (chainLocked) return { status: COPY.locked, detail: null, spinner: false, primary: null, leave: false };
  switch (state?.step) {
    case undefined:
      return { status: null, detail: null, spinner: false, primary: { label: COPY.approve, disabled: false }, leave: false };
    case "starting": // vetting the deposit RPC (genesis check, 5s timeout)
      return busy(COPY.preparing);
    case "startFailed": // raw error is logged, never shown
      return retry(COPY.startFailed, null, true);
    case "slow": // the 5s timeout hit: say so, don't fall back silently
      return retry(COPY.slow, null, false);
    case "connecting":
    case "preparing":
      return busy(COPY.opening(stake));
    case "wallet":
      return busy(state.retry ? COPY.reprompt : COPY.opening(stake));
    case "sending":
    case "confirming":
    case "locked": // tx confirmed; Locked ✓ waits for the server's room-account read
      return busy(COPY.confirming);
    case "cancelled":
      return retry(COPY.notApproved, null, true);
    case "error":
      return retry(COPY.notApproved, state.message, true);
  }
}

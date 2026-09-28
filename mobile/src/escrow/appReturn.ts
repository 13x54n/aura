/**
 * "Came back from Phantom without an answer" detector. Arms only after a real `background`
 * state (the app actually left the foreground), never on inactive → active (notification
 * shade, permission dialogs, iOS app switcher peeks). Pure so it can be unit-tested.
 */
export type AppStateLike = "active" | "background" | "inactive" | "unknown" | "extension" | string;

export function createReturnWatcher(
  onReturnWithoutAnswer: () => void,
  graceMs = 2500,
  timers: { set: (fn: () => void, ms: number) => any; clear: (t: any) => void } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (t) => clearTimeout(t),
  }
) {
  let wentBackground = false;
  let timer: any = null;
  const disarm = () => {
    if (timer != null) timers.clear(timer);
    timer = null;
  };
  return {
    onChange(state: AppStateLike) {
      if (state === "background") {
        wentBackground = true;
        disarm();
      } else if (state === "active") {
        disarm();
        if (wentBackground) {
          wentBackground = false;
          timer = timers.set(() => {
            timer = null;
            onReturnWithoutAnswer();
          }, graceMs);
        }
      }
      // "inactive" and others: neither arm nor disarm.
    },
    /** A Phantom redirect arrived: stop waiting. */
    stop: disarm,
  };
}

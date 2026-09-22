/** Host SDK v0 — narrow capability surface for WebView games. */

export type HostSdkVersion = "0.1.0";

export type Capability =
  | "storage.save"
  | "storage.load"
  | "haptics.light"
  | "wallet.getAddress"
  | "score.submit"
  | "nav.close";

export type HostRequest = {
  id: string;
  type: "host.request";
  method: Capability | "host.ready" | "host.handshake";
  params?: Record<string, unknown>;
};

export type HostResponse = {
  id: string;
  type: "host.response";
  ok: boolean;
  result?: unknown;
  error?: string;
};

export type HostEvent = {
  type: "host.event";
  event: "lifecycle.suspend" | "lifecycle.resume" | "auth.changed";
  payload?: Record<string, unknown>;
};

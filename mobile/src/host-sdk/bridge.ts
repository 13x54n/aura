import type { Capability, HostRequest, HostResponse } from "./types";
import { CapabilityBroker } from "./CapabilityBroker";

type Handlers = Partial<
  Record<Capability, (params?: Record<string, unknown>) => Promise<unknown>>
>;

/** Routes validated WebView messages to capability handlers. */
export async function handleHostRequest(
  raw: string,
  broker: CapabilityBroker,
  handlers: Handlers
): Promise<HostResponse | null> {
  let msg: HostRequest;
  try {
    msg = JSON.parse(raw) as HostRequest;
  } catch {
    return null;
  }
  if (msg.type !== "host.request" || !msg.id || !msg.method) return null;

  if (msg.method === "host.handshake" || msg.method === "host.ready") {
    return {
      id: msg.id,
      type: "host.response",
      ok: true,
      result: { sdk: "0.1.0", grants: broker.list() },
    };
  }

  if (!broker.allow(msg.method)) {
    return {
      id: msg.id,
      type: "host.response",
      ok: false,
      error: `capability_denied:${msg.method}`,
    };
  }

  const fn = handlers[msg.method];
  if (!fn) {
    return {
      id: msg.id,
      type: "host.response",
      ok: false,
      error: `not_implemented:${msg.method}`,
    };
  }

  try {
    const result = await fn(msg.params);
    return { id: msg.id, type: "host.response", ok: true, result };
  } catch (e) {
    return {
      id: msg.id,
      type: "host.response",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

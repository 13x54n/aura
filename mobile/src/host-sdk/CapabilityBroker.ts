import type { Capability } from "./types";

const DEFAULT_GRANTS: Capability[] = [
  "storage.save",
  "storage.load",
  "haptics.light",
  "wallet.getAddress",
  "nav.close",
];

/** Authorizes each Host SDK call against manifest grants (stub: fixed allowlist). */
export class CapabilityBroker {
  constructor(private grants: Capability[] = DEFAULT_GRANTS) {}

  allow(method: string): method is Capability {
    return (this.grants as string[]).includes(method);
  }

  list(): Capability[] {
    return [...this.grants];
  }
}

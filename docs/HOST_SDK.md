# Aura — Host SDK (live bridge)

Version **0.1.0**. Source of truth in code: `mobile/src/host-sdk/types.ts` + `CapabilityBroker.ts` + `WebGameScreen` handlers.

Transport: WebView `postMessage` JSON.

```json
{ "id": "h1", "type": "host.request", "method": "wallet.getAddress", "params": {} }
{ "id": "h1", "type": "host.response", "ok": true, "result": "…" }
```

Unknown / denied methods return `ok: false` with a short error code — never host internals.

## Handshake (always allowed)

| Method | Direction | Result |
|--------|-----------|--------|
| `host.handshake` | Game → host | `{ sdk: "0.1.0", grants: string[] }` |
| `host.ready` | Game → host | Same as handshake (game signals ready) |

## Capabilities (grant-gated)

Default Free Play grants (stub allowlist):

| Method | Direction | Purpose | Notes |
|--------|-----------|---------|--------|
| `wallet.getAddress` | Game → host | Public key or `null` | Triggers **host Connect** if disconnected — no in-game wallet UI |
| `nav.close` | Game → host | Exit WebView | Back to shelf |
| `storage.save` | Game → host | Persist `{ key, value }` | Game-scoped in-memory stub today |
| `storage.load` | Game → host | Load by `key` | |
| `haptics.light` | Game → host | Light haptic | Stub OK |
| `match.create` | Game → host | Create match snapshot | In-host `MatchService` stub |
| `match.get` | Game → host | `{ matchId }` → snapshot | |
| `match.command` | Game → host | `{ matchId, command }` | Commands: `join`, `ready`, `roll`, `move`, `forfeit` |
| `escrow.status` | Game → host | `{ locked, matchId }` | Read-only; lock/payout stay **host screens** |

Declared but not in default grants yet: `score.submit`.

## Host → game events (planned / partial)

| Event | Purpose |
|-------|---------|
| `lifecycle.suspend` / `lifecycle.resume` | App background |
| `auth.changed` | Wallet connect/disconnect |
| `match.updated` | Push match snapshot (multiplayer later) |

## Not on the bridge (by design)

| Concern | Where it lives |
|---------|----------------|
| Connect / Seed Vault / Phantom UI | Host only |
| Escrow lock / payout | Host screens (`EscrowScreen`) |
| Catalog / icons / covers | Host reads `games/*/manifest.json` + assets |
| Primary tokens / refresh | Never exposed to WebView |

## Manifest tie-in

Each `games/<id>/manifest.json` lists `capabilities` the package may request. Broker should intersect grants with the manifest (today: fixed allowlist; tighten in phase 2).

## Injected helper

Packed games may use `window.AuraHost.*` wrappers (`handshake`, `ready`, `getAddress`, `close`, `matchCreate`, `matchCommand`, `escrowStatus`, …) — thin clients over the same methods.

# Aura — architecture

## Decision summary

| Choice | Decision |
|--------|----------|
| Runtime | **WebView-first** for catalog games |
| Host | React Native (Expo) + Hermes |
| Trust | Games are **untrusted**; host is trusted |
| Bridge | Versioned **Host SDK** over postMessage — capability scoped |
| Native federation | Re.Pack **later**, first-party only |
| Escrow / wallet | **Host only** — never inside the game bundle |

## Trust zones

```
Player → RN Host (identity, catalog, wallet, policy)
            ↓ mounts
         WebView mini-app (board, input, animation)
            ↓ commands / events
         Match service (authoritative rules, dice, rooms)  [when multiplayer]
```

Hard boundary: WebView never receives primary access/refresh tokens, keychain access, or generic native handles. Games get a short-lived, game-scoped session + declared capabilities.

## Host responsibilities

- Catalog (reads `games/*/manifest.json` + icons/covers)  
- Navigation / tabs / Play handoff (shell → glass load → full-bleed WebView)  
- Wallet connect (Phantom on Expo Go; Seed Vault on Seeker client)  
- Escrow stake **before** mount; payout after **server-attested** result  
- Policy, kill switch (later), telemetry consent  

## Mini-app responsibilities

- Render board, legal highlights, sound, local prefs  
- Call Host SDK methods only (see [HOST_SDK.md](./HOST_SDK.md))  
- Remain portable HTML5/Canvas (one build for iOS/Android WebView)

## Play handoff UX

1. User taps Play on shelf/hero  
2. Host shows short **glass** loading (no white flash)  
3. WebView mounts full-bleed packed HTML  
4. Back returns to **same shelf position**

## Host SDK (bridge contract)

Versioned JSON request/response over WebView `postMessage`. Unknown methods rejected; errors reveal no host internals.

**Live method list:** [HOST_SDK.md](./HOST_SDK.md) (synced to `mobile/src/host-sdk/`).

Headline capabilities today: `host.handshake` / `host.ready`, `wallet.getAddress` (host Connect handoff), `nav.close`, `storage.*`, `haptics.light`, `match.create` / `match.get` / `match.command`, `escrow.status` (read-only). Escrow lock/payout and Connect UI stay on the host — not bridge methods.

## Match authority (multiplayer)

Clients send **commands**; only server-approved **events** mutate canonical state. Deterministic reducer + versioned **`RuleProfile`** per match (immutable once referenced — publish `classic-v2`, never mutate `classic-v1`). Free Play may run local/bots without ranked claims.

Sample Ludo `classic-v1`: 2–4 players, 4 pieces, enter on 6, extra turn on 6, max 3 consecutive sixes, exact finish, blockades off, ~20s turn timer, 60s disconnect grace.

## Package / release (near-term stub)

Each game has `games/<id>/manifest.json`:

- `appId`, `version`, `entry`, `capabilities`, `sha256`, `status: draft`  
- Immutable bytes later (portal phase 2): signed artifact = reviewed artifact  

## Out of scope (for now)

CDN / signed-manifest / kill-switch UI, Module Federation remotes, third-party native modules, real-money gambling UX.

## Policy note (store)

Apple Guideline **4.7** (mini apps / mini games) favors WebView + an **explicit capability bridge** over unrestricted native bridges. Confirm the exact design before any App Store path. Re.Pack Module Federation is composition, not isolation — Lane B is trusted first-party only.

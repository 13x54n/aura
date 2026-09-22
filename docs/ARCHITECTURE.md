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
- Call Host SDK methods only (`host.ready`, `identity.getSession`, `match.*`, etc.)  
- Remain portable HTML5/Canvas (one build for iOS/Android WebView)

## Play handoff UX

1. User taps Play on shelf/hero  
2. Host shows short **glass** loading (no white flash)  
3. WebView mounts full-bleed packed HTML  
4. Back returns to **same shelf position**

## Match authority (multiplayer)

Clients send **commands**; only server-approved **events** mutate canonical state. Deterministic reducer + rule profile version per match. Free Play may run local/bots without ranked claims.

## Package / release (near-term stub)

Each game has `games/<id>/manifest.json`:

- `appId`, `version`, `entry`, `capabilities`, `sha256`, `status: draft`  
- Immutable bytes later (portal phase 2): signed artifact = reviewed artifact  

## Out of scope (for now)

CDN / signed-manifest / kill-switch UI, Module Federation remotes, third-party native modules, real-money gambling UX.

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
| **Game independence** | **Each mini-game is external** — this repo does not contain game logic |

## Aura is the store, not a game

**Critical:** Aura is a **distribution platform for Seeker mini-games**. This repository builds the host. Games are not developed here.

Each mini-game:

- Is hosted outside this repo and loaded from an `entryUrl`
- Talks to Aura only through the Host SDK
- Can be added or updated without shipping a new game binary inside Aura

The host provides catalog, wallet, and escrow. It never embeds a board.

## Trust zones

```
Player → RN Host (identity, catalog, wallet, policy)
            ↓ mounts entryUrl
         WebView mini-game (untrusted)
```

Hard boundary: WebView never receives primary access/refresh tokens, keychain access, or generic native handles. Games get a short-lived, game-scoped session + declared capabilities.

## Host responsibilities

- Catalog (`AURA_GAMES`: remote art + `entryUrl`)  
- Navigation / tabs / Play handoff (shell → glass load → full-bleed WebView)  
- Wallet connect: **Phantom deep link in Expo Go (the default build)**. Seed Vault / MWA come later, through an optional dev client  
- Escrow stake **before** mount; payout after **server-attested** result  
- Policy, kill switch (later), telemetry consent  

## Mini-app responsibilities

- Render board, legal highlights, sound, local prefs  
- Call Host SDK methods only (see [HOST_SDK.md](./HOST_SDK.md))  
- Remain portable HTML5/Canvas (Android WebView; Aura is Android-only as of 2026-09-28)

## Play handoff UX

1. User taps Play on shelf/hero  
2. Host shows short **glass** loading (no white flash)  
3. WebView mounts the listing’s `entryUrl`  
4. Back returns to **same shelf position**

## Host SDK (bridge contract)

Versioned JSON request/response over WebView `postMessage`. Unknown methods rejected; errors reveal no host internals.

**Live method list:** [HOST_SDK.md](./HOST_SDK.md) (synced to `mobile/src/host-sdk/`).

Headline capabilities today: `host.handshake` / `host.ready`, `wallet.getAddress` (host Connect handoff), `nav.close`, `storage.*`, `haptics.light`, `match.create` / `match.get` / `match.command`, `escrow.status` (read-only). Escrow lock/payout and Connect UI stay on the host — not bridge methods.

## Mini-games

There is no match server and no packed HTML in this repo. A future mini-game may call `match.*` on the Host SDK; those methods are not implemented on the host yet and return `not_implemented`.

## Package / release

A listing is a store record (`entryUrl`, art URLs), not a folder in this repo. Signed manifests and a CDN are phase 2.

## Next.js mini-apps

**Locked:** a mini-game may be a static web export loaded by URL. Not an RN screen. No in-WebView store chrome / second tab bar.

## Out of scope (for now)

CDN / signed-manifest / kill-switch UI, Module Federation remotes, third-party native modules, real-money gambling UX.

## Policy note (store)

*(Parked: Aura is Android-only as of 2026-09-28.)* Apple Guideline **4.7** (mini apps / mini games) favors WebView + an **explicit capability bridge** over unrestricted native bridges. Confirm the exact design before any App Store path. Re.Pack Module Federation is composition, not isolation — Lane B is trusted first-party only.

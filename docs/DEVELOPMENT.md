# Aura: local development

> **Platform: Android only** (Seeker first), locked 2026-09-28.

Aura is the Seeker game store. This checkout is the host app (store, wallet, Host SDK, escrow). Mini-games are not in this repo and are not required to run the store.

## Run the app

```bash
cd mobile
npm install
npm run dev
```

`npm run dev` is `expo start -c`. Scan the QR code with Expo Go. Home, Arcade, and Search open on an empty catalog.

## Prerequisites

- Node.js 20 or newer.
- Expo Go on an Android phone (Seeker or any other). This is the default build.
- Phantom on the same phone, set to Devnet, for wallet connect in Expo Go.
- Nothing may break Expo Go: no custom native modules, only packages that work in Expo Go (SDK 57).
- Optional later: a custom dev client (`npm run android`) for Mobile Wallet Adapter / Seed Vault.

## Wallet

Connect from the header or the Wallet tab. Balances are host-only. Match history stays empty until mini-games are listed.

## Escrow

The on-chain program lives in `escrow/`. The host client used by those tests is `server/escrow.mjs` (not a game server). See [WALLET_AND_ESCROW.md](./WALLET_AND_ESCROW.md).

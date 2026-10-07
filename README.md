# Aura

Digital distribution platform for Solana Seeker phone games. Every title is an Aura mini-game mounted from a URL. This repository is the platform (store, wallet, Host SDK, escrow), not the games.

## Product lock

- Seeker store: Home, Arcade, Friends, Wallet, Search
- Catalog starts empty. A listing carries an `entryUrl`; the WebView loads it
- Wallets: **Phantom through a deep link in Expo Go** (the default build). Seed Vault / MWA come later, with an optional dev client
- Frame stakes as **skill + escrow**, not casino

## Stack

- React Native + Expo SDK 57
- Path: `/Users/lex-work/aura`

## Kill rules

- No games authored in this repo
- No fake / placeholder titles on the shelves
- No prediction or gambling UX framing

## Documentation

**Run it locally:** [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md)

Deep docs live in [`docs/`](./docs/README.md).

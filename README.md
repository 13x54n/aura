# Aura

Seeker-native **game publisher shell** + first title: **staked Ludo** (skill + escrow).

## Product lock
- Long-run: thin store of *our* games on Seeker (not a dApp Store clone)
- CLOCK IN demo: Ludo — create/join/random rooms, Solana escrow, winner payout
- Wallets: **Phantom through a deep link in Expo Go** (the default build, locked 2026-09-28). Seed Vault / MWA come later, with an optional dev client
- Frame as **skill + escrow**, not casino

## Stack
- React Native + Expo SDK 57, **Expo Go first**: no custom native modules, and only Expo Go–compatible packages
- Mobile Wallet Adapter (MWA) / Seed Vault: future, needs a dev client
- Path: `/Users/lex-work/aura`

## CLOCK IN milestones (through Oct 8, 2026)
1. Expo Go + Phantom connect (Seed Vault / MWA later, with a dev client)
2. Store shell — home, Ludo tile, coming soon
3. Ludo rooms — create / join / random
4. Solana skill-escrow — stake in, winner out
5. Realtime multiplayer end-to-end
6. Signed APK + dApp Store path + demo/deck

## Kill rules
- No prediction/gambling UX framing
- No competing full Steam catalog — shelf stays thin
- Phantom-only connect does **not** count for Milestone 1

## Documentation

**Run it locally:** [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) (match server, Expo, rooms on your phone).

Deep docs live in [`docs/`](./docs/README.md):

- Product, architecture, games, wallet/escrow, phase-2 ops
- Living research: [`RESEARCH.md`](./RESEARCH.md)


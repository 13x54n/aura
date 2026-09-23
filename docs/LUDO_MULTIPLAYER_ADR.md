# Aura — Ludo multiplayer & matchmaking ADR

**Status:** Accepted — Lex **go** 2026-09-23  
**Rules:** [LUDO_RULEBOOK.md](./LUDO_RULEBOOK.md) (`classic-v1`) is DoD for #1 and match service.

**Build order (no scope creep):** (1) Free Play board direction → (2) create/join/random **without** H3 → (3) stake validate → (4) H3 nearby v1.1

## Problem

Free Play has wrong-way piece tags (path/color vs clockwise track). Multiplayer rooms, low-latency match, and Solana skill-escrow must not ship until that client bug is fixed — every room would inherit it.

## Decisions

| Topic | Decision |
|-------|----------|
| Board truth (Free Play) | Fix path/START mapping in `games/ludo` first (issue #1) |
| Runtime | Ludo stays **WebView** mini-app; Aura RN host owns catalog, wallet, escrow, rooms entry |
| Authority | **Commands in → server events out**; deterministic reducer + versioned `RuleProfile` |
| Match stack | **Colyseus** (or thin Node WS + Redis) — rooms, reconnect, low-latency roll/move |
| Matchmaking v1 | Create room / Join by code / Random **global** (Redis queues) — **no H3 yet** |
| Matchmaking v1.1 | **H3 res 8** waiting sets + `gridDisk` expand k=1→3→5 + Haversine filter; opt-in coarse location only |
| Stake | Host signs on device; **backend validates** escrow tx/PDA before seats unlock; payout on **server-attested** result only |
| Wallet | Seeker: custom Expo client + **MWA / Seed Vault**; Expo Go: Phantom deep-link smoke only. One Connect button, two backends. Free Play = wallet-free |
| Next.js games | Static export only (separate ADR) — not this track |

## Sequence

0. Keep Aura host Seeker-ready (`expo run:android`, MWA) — parallel, don’t block #1  
1. **Ludo direction** — Red/Yellow/Green/Blue walk clockwise track correctly (Expo Go smoke)  
2. **Rooms** — Create / Join / Random without geo; authoritative match; WebView mounts with `matchId`  
3. **Stake validate** — stake sheet on Create/Join/Random only (never Free Play); backend verify before seat unlock  
4. **H3 nearby** — “finding nearby…” UX, soft distance hint, no map trail  

## H3 (v1.1 detail)

- Index queues at **resolution 8** (~0.74 km², edge ~530 m)  
- Search: `latLngToCell` → `gridDisk(k)` rings **1 → 3 → 5**, then exact distance filter  
- Redis: `waiting:h3:{cell}` + atomic seat claim (Lua / SETNX)  
- Privacy: opt-in; store coarse cell only; clear on match/cancel — never raw GPS trail  

## Latency targets

- In-match roll/move ack: **&lt;100 ms** regional  
- Random match fill: 1–5 s acceptable; nearby expand every ~2 s until timeout → global fallback  

## Trust split (unchanged)

| Zone | Owns |
|------|------|
| RN host | Connect, stake UI, escrow txs, catalog, Play handoff |
| WebView | Board, input, animation — Host SDK only |
| Match service | Dice, legal moves, seats, timers, event log, result hash |
| Chain | Escrow PDA — validated by backend, never “client says I won” |

## UX lock (rooms)

Ludo hub → **Create / Join / Random / Free Play** → stake sheet only on paid paths → glass load → full-bleed board → Back to shelf.

## Out of scope (this ADR)

Portal/admin, hosted SSR Next games, casino framing, raw player location analytics.

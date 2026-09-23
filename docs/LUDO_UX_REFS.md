# Ludo board & rooms UX (Lex refs 2026-09-23)

**Status:** Visual / IA lock — map to Aura glass + purple; stake = real escrow not fake gold.

## Layer 1 — In-board (Free Play + match)

- Avatar + name at **each yard corner**, in a **chrome gutter outside** the board (never over yards)
- Turn order **screen-clockwise**: BL→TL→TR→BR (Red→Green→Blue→Yellow after rotate)
- Human house stays **bottom-left** (view rotate)
- **Dice dock on the active seat** (glow on that avatar); timer + stake chip beside dock
- Roll only on **your** corner on your turn; opponents’ turn → dock on their corner
- Bottom chrome: Close / secondary only — not the primary Roll
- **Chrome never covers yards:** avatar + dice dock sit in the **margin outside** the board square (beside the corner), not over tokens
- **Turn order = clockwise in screen space** after seat rotate (BL → TL → TR → BR → …), matching Rule Book clockwise seats
- Chat / quick reactions = later overlay (don’t block #1)

## Layer 2 — Mode sheet (before START)

Carousel: **Classic / Rush / Tournament** → select token color → **2 / 4 / 2v2** players → choose bet (entry / win) → **START**.

Aura mapping: bet = **SOL / USDC / SKR escrow** amounts (host), never casino “gold” copy. v1 can ship Classic only; Rush/Tournament labels OK as coming-soon if needed — don’t invent modes without RuleProfile.

## Layer 3 — Rooms

- **Select Table** list: room id, entry, prize, seats, mode → Create Table / Play Now  
- **Join by code** modal  
- **Friend lobby:** 2×2 seats, color pick, entry/win, Join / Start  

Backend still: create / join / random **sans H3** after Rule Book #1 clears (see [LUDO_MULTIPLAYER_ADR.md](./LUDO_MULTIPLAYER_ADR.md)).

## Kill / keep

| Keep | Kill |
|------|------|
| Glass + purple Aura chrome | Fake gold / casino chips as product currency |
| Skill-escrow framing | “Gambling” copy |
| Host-owned stake sheet | Second wallet UI in WebView |
| Human BL seat | Mirrored rules to fake seat |

## Reference shots (Lex 2026-09-23)

- [In-board dock](./assets/ludo-refs/01-inboard.jpg)
- [Mode sheet](./assets/ludo-refs/02-mode-sheet.jpg)
- [Rooms / lobby](./assets/ludo-refs/03-rooms.jpg)

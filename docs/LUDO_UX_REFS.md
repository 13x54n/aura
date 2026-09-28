# Ludo board & rooms UX (Lex refs 2026-09-23)

**Status:** Visual / IA lock — map to Aura glass + purple; stake = real escrow not fake gold.

## Layer 1 — In-board (Free Play + match)

- **Board ~90% usable width** — gutter ~48–56px for avatar+die only; tokens stay tappable
- Avatar (+ quiet **You** ring for human) at **each yard corner** — **no color name labels**, in a **chrome gutter outside** the board (never over yards)
- Turn order **screen-clockwise**: BL→TL→TR→BR (Red→Green→Blue→Yellow after rotate)
- Human house stays **bottom-left** (view rotate)
- **Dice dock on the active seat** (glow on that avatar); timer + stake chip beside dock
- Tap the **die** to roll (no Roll button); only your die is tappable on your turn
- Timer **hidden** until ≤10s, then shown **on the die** (not a separate chip)
- No **Free** / stake chip on the Free Play dock — die only
- Bottom chrome: Close / secondary only — not the primary Roll
- **Chrome never covers yards:** avatar + dice dock sit in the **margin outside** the board square (beside the corner), not over tokens
- **Turn order = clockwise in screen space** after seat rotate (BL → TL → TR → BR → …), matching Rule Book clockwise seats
- **No Roll button** — tap the **die** to roll
- **Timer hidden** until ≤10s left, then show countdown **on the die** (not a separate chip)
- **No Free / gold / stake chip** on Free Play dock — die (+ timer≤10s) only
- Die sits **left or right of the avatar only** (never above/below) — Lex map: **TL right · TR left · BL right · BR left** (horizontal pair in gutter, off yard)
- Chat / quick reactions = later overlay (don’t block #1)
- **Juice:** dice spin/rattle SFX+anim on roll; token path anim + soft land SFX on move (stronger hit on capture later) — short, readable; **animate only from accepted events**

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

## 8-screen wireframe (Lex 2026-09-28)

Home dashboard · Create match · Join by code · Quick match (stake chips + finding table) · Pre-game lobby · Live game · Winner/payout · Wallet/history.

- Balance / Add cash = **host USDC wallet**; stakes = escrow, host signs — no fake cash
- Wireframe Home · Play · Wallet tabs → **Ludo hub sections** (locked 2026-09-28: UX call, Lex go) — no second tab bar in WebView
- Live game keeps locks: human BL, die beside avatar (TL/BL right, TR/BR left), tap die, timer ≤10s
- ~~Mock data~~ **Superseded 2026-09-28 (Lex): real players only.** Lobby seats from server `room.state` (empty = "Waiting for player…"); Join card from server (bad code → Table not found); Quick = real stake/count queue, ~60s → Keep waiting / Back to hub, never bots; no fake online counts; Recent/Result/Wallet history real or empty state. Bots = Free Play only. Until escrow ships, rooms default to 0 USDC friendly; paid chips show "Unlocks with escrow".
- Moves slower: `HOP_MS` 200 / `LAND_MS` 160 in `games/ludo/game.js` (6-cell ≈1.4s)
- Hub layout: USDC balance card (Add funds → host Connect) · Create / Join / Quick · Recent strip → Wallet/history; lobby 2×2 seat grid; finding = pulsing ring + Cancel; payout card → Play again / Back to hub
- Audio OK on Lex device; bridge + expo-audio (playsInSilentMode) held in reserve

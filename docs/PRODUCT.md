# Aura — product specification

**Name:** Aura  
**Home:** `/Users/lex-work/aura` (Expo app: `mobile/`; mini-apps: `games/`)  
**Platform:** Solana Mobile Seeker first; Expo Go for day-to-day UI (Phantom connect)

## Vision

Aura is a **first-party game publisher shell** on Seeker: a glass “App Store for our games” that discovers, launches, and governs **independently packaged mini-games**. Games are not embedded forever in the binary — they ship as sealed packages Aura mounts in a WebView.

We are **not** rebuilding the Solana dApp Store. We ship *our* catalog into Seeker and, later, let studios submit through a governed portal.

## North star (current)

**Three playable boards**, each its own mini-app:

1. **Ludo** — Free Play board + bots; rooms / escrow deepen next  
2. **Chess** — Free Play (player = White vs bot)  
3. **Snakes & Ladders** — Free Play (player vs bot)

Smoke gate: **Free Play → real board → real moves** for all three. No hub stubs.

## Information architecture

| Tab | Role |
|-----|------|
| **Home** | Featured carousel (HTTPS art), Continue (real history only), shelves |
| **Arcade** | Full catalog of real titles |
| **Friends** | Social later; honest empty state OK |
| **Library** | Installed / played titles |
| **Search** | Find by name |

**Header:** thin, under safe-area — **Connect** (or profile avatar) top-right only.  
**CTA:** cover / hero → **Play** (never Get / Buy / price).

## Visual language

- Dark navy + purple accents + **glass** (frosted header / floating tab capsule)
- Full-bleed hero with **Play on art**, “For You” tag, carousel dots
- Remote HTTPS background images; top + bottom gradients for type contrast
- Every game ships **icon.png + cover.png** (no letter glyphs)
- Floating frosted **tab capsule**; Search as round glass button beside the bar
- Header: Connect **or** avatar — never both


## UX lock

Single product-family bar for store + Free Play:

1. **IA** — App Store–for-games: Home · Arcade · Friends · Library · Search (floating frosted tab capsule)  
2. **Look** — dark + purple + glass; real `icon` / `cover` art (no letter tiles)  
3. **CTA** — **Play** only (never Get / Buy / price)  
4. **Wallet / escrow** — host chrome only; WebView never shows Connect or stake UI  
5. **Play path** — shelf/hero → short **glass** load (no white flash) → **full-bleed** WebView board → **Back** returns to that game’s shelf (not cold Home)  
6. **In-board** — clear whose turn; Chess = selected piece + legal squares; Snakes/Ludo = Roll + readable dice/status  

## Kill rules

- No fake / placeholder games on shelves  
- No casino framing; skill + escrow only (when stakes land)  
- Stake-skill pattern: **Chess = pure skill**; **Ludo / Snakes = skill + fair dice** (commit-reveal/VRF on server when multiplayer)  
- No second wallet UI inside WebViews — host owns Connect  
- No Phantom-only product path (Seeker / Seed Vault remains default when available)  
- Don’t stall boards to build developer portal (phase 2)

## Differentiation

| Competitor pattern | Aura |
|--------------------|------|
| Web wager lobbies | Seeker-native shell + Seed Vault |
| Token-gimmick Ludo | Clean skill-escrow, no junk token |
| One-off game APKs | Catalog of sealed mini-apps + Host SDK |
| 1MGaming / Tap2Win / Ludo Cities | Seeker Seed Vault UX, no junk token, escrow clarity |

## Success metrics (product)

- Time-to-first-move &lt; 30s from cold open (Free Play)  
- All three titles launch from Arcade without stub chrome  
- Connect works on Expo Go (Phantom) and later Seed Vault on Seeker  
- Back from game restores shelf position (not cold Home)

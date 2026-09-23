# Aura — research brief

> **Canonical deep docs:** [`docs/`](./docs/) (PRODUCT, ARCHITECTURE, GAMES, WALLET_AND_ESCROW, OPS_PHASE2). This file stays the living ADR / lock scratchpad.

## Product lock
- Product title: **Aura** (not Playseek)
- First-party **Seeker game publisher** (thin store shell) + **staked skill games**: **Ludo · Chess · Snakes & Ladders**
- Path: `/Users/lex-work/aura` (Expo app under `mobile/`)
- Repo: **https://github.com/13x54n/aura** (private `main`)
- Long-run: store of *our* games; CLOCK IN deep demo = **Ludo** (Chess + Snakes Playable hubs first)
- Event: **CLOCK IN** through **Oct 8, 2026**

## IA / UI lock (updated)
- Feel: **App Store for games** + **glass** (frosted cards/headers)
- Tabs: **Home · Arcade · Friends · Library · Search**
- Catalog: **real titles only** (Ludo for now; empty shelves OK — don’t fake games)
- CTA: cover → **Play** straight into game — **no Get** button
- Connect stays in header (Phantom on Expo Go; Seeker Seed Vault when client present)

## Visual lock (Lex refs 2026-09-21)
- Look: **dark + purple + glass** — frosted chrome, soft cards/chips, bold white titles, purple accents
- Ref 1 (Gamehaven-style): featured hero, chip row under title, horizontal shelves
- Ref 2 (Xbox/Arcade-style): **full-bleed hero with Play on the art**, “For You” tag, page dots under hero, **Continue Playing** shelf, **floating frosted tab capsule** (Search as round glass button beside bar)
- Do **not** copy: Store/Profile, Buy/prices/trials, fake multi-title catalogs, Subscriber Arcade chrome
- Ours: tabs Home · Arcade · Friends · Library · Search; cover/hero → **Play**; real titles only (Ludo · Chess · Snakes)
- Header: **thin**, clear of status bar (safe-area) — **Connect or profile top-right only** (no heavy title chrome / no merge into notch)
- Hero carousel: **dynamic** (swipe + auto-advance + live dots); carousel slides for all three real titles
- Hero art: **remote HTTPS bg URLs** full-bleed per slide (Xbox-ref style) — not flat color blocks; three real titles only

## Catalog (updated)
- Real titles only: **Ludo · Chess · Snakes & Ladders**
- CLOCK IN: Ludo = deep (rooms / random / realtime / skill-escrow); Chess + Snakes = Playable hubs first
- Same stake-skill pattern for all three: escrow PDA + skill framing (not casino) — Chess = pure skill; Ludo/Snakes = skill + fair dice (commit-reveal/VRF)
- Home carousel + Arcade shelves list all three; cover → **Play**

## Build lock (updated)
- **Priority:** playable product — not hackathon date pressure
- **Ludo = separate mini-app** under `games/ludo` (own package); Aura only catalogs + mounts via WebView / Host SDK
- Chess / Snakes = same pattern as Ludo: `games/chess`, `games/snakes` — Free Play with real boards
- Open-source Ludo boards OK if **license is clean** (prefer MIT/Apache-2.0); keep Aura escrow/wallet host-only
- Smoke gate: **Free Play → real moves** on Ludo · Chess · Snakes (not hub stubs)
- Catalog: every mini-game has a **real icon/cover** on Home/Arcade/Library (no blank tiles) — assets can live with each `games/<id>/` package

## OSS starters (MIT)
- Ludo: AmitThakur/ludo (in `games/ludo`)
- Chess: [GizzZmo/Chession](https://github.com/GizzZmo/Chession) (Canvas + chess.js) — alt [usamagulzar/chex](https://github.com/usamagulzar/chex)
- Snakes & Ladders: [lemueldiergos/snake-and-ladder](https://github.com/lemueldiergos/snake-and-ladder) (Canvas) — alt [abp437/snake-and-ladders](https://github.com/abp437/snake-and-ladders)
- Skip GPL / unverified licenses

## Loop
Create/join/random room → Solana skill-escrow stake → realtime Ludo → winner payout

## Seeker / Solana Mobile host (locked)
- Aura host follows Solana Mobile docs: scaffold via `create-solana-dapp` / Expo **custom development build** (not Expo Go for real wallet)
- MWA + Seed Vault; Android via `expo run:android`
- Expo Go = UI / Free Play smoke only (Phantom deeplink); Seed Vault needs Seeker custom/EAS client
- Mini-games stay WebView; **wallet + escrow only on Aura host** via MWA
- Refs: https://docs.solanamobile.com/react-native/expo , sample apps (cause-pots, Settle, Idle Farming)

## Wallets
- **Seeker / Seed Vault auto when available** (default; grant + CLOCK IN Seeker path by Sep 30)
- **Phantom real connect** as Expo Go / Mac option (deep-link / mobile connect — not mock-only)
- Kill rule still holds: no Phantom-*only* product path

## Wedge vs competitors
| Competitor | Note | Our angle |
|---|---|---|
| 1MGaming | Multi-board + SOL escrow | Seeker-native Seed Vault UX |
| Tap2Win | Skill-dice Ludo / USDC | SGT anti-smurf + phone-first |
| Ludo Cities | PvP + LUDC token | No junk token; escrow clarity |
| dApp Store | Already “Steam” for Seeker | Don’t rebuild catalog — ship into it |

## Fairness / framing
- Skill + escrow (not casino)
- Escrow PDA + commit-reveal or VRF dice + public match replay
- Optional SKR entry / Seeker quest — not airdrop

## ADR — Mini-app game store (Sep 2026)
- **Decision:** WebView-first runtime for distributable games; RN shell is the product
- **Host (RN + Hermes):** catalog, identity/wallet, Play, policy, downloads, updates, support
- **Games (HTML5/Canvas/WebGL in WebView):** Ludo · Chess · Snakes & Ladders — isolated; call only a **versioned Host SDK** over a narrow message bridge (no raw native imports)
- **Lane B later:** Re.Pack Module Federation only for trusted first-party native modules (not the sandbox)
- **Trust boundary:** games get short-lived game-scoped session + approved capabilities — never primary tokens, keychain, arbitrary FS, or generic native handles
- **Ship cut:** shell + catalog + Play → WebView game (Ludo deep; Chess/Snakes lighter). Signed manifest / CDN / kill-switch later. *(Hackathon dates deprioritized — playable Ludo first.)*
- **Policy note:** Apple 4.7 / mini-app posture favors WebView + explicit bridge over unrestricted RN bridges — confirm before App Store path
- **Play UX:** shell chrome until WebView mounts → short load → full-bleed game; Back restores shelf position (not cold Home)

## Package layout (build focus)
- **`games/ludo`**: standalone playable Ludo mini-app (Free Play board + bots). Pack with `node scripts/pack-ludo.mjs` → `mobile/src/runtime/ludoBundle.ts`
- Each mini-app ships **`icon.png` + `cover.png`**; Aura catalog requires them (no blank tiles). Mirrored under `mobile/assets/games/<id>/` for Metro.
- **`games/chess`**: Free Play vs random bot (chess.js 0.10.3 BSD + Chession-inspired UI). Pack: `node scripts/pack-chess.mjs`
- **`games/snakes`**: Free Play canvas Snakes & Ladders (you vs bot). Pack: `node scripts/pack-snakes.mjs`

- Aura RN host: catalog + Host SDK + escrow/wallet only — mounts the packed HTML in WebView
- North star: **playable Ludo**, not hackathon date theater

## Ludo Rule Book v1.0 (canonical)
- [`docs/LUDO_RULEBOOK.md`](./docs/LUDO_RULEBOOK.md) — shared DoD for client/server/QA
- Key: 6→start (not +6), clockwise, exact home, safe cells, one bonus, three 6s forfeit turn

## ADR — Ludo multiplayer (accepted 2026-09-23)
- Full doc: [`docs/LUDO_MULTIPLAYER_ADR.md`](./docs/LUDO_MULTIPLAYER_ADR.md)
- Order: (1) Free Play direction → (2) rooms sans H3 → (3) stake validate → (4) H3 res-8 nearby
- Colyseus/WS + commands/events; host wallet/escrow; Free Play wallet-free

## ADR — Ludo mini-game (Sep 2026)
- **Split:** WebView = portable Ludo (board, input, animation, client prediction); **authoritative match server** = dice, legal moves, timers, event log, results; RN host = identity, catalog, wallet, escrow, policy
- **Model:** commands in → server validates → ordered events out; deterministic reducer (replay / disputes)
- **Rules:** versioned `RuleProfile` per match (immutable once referenced); sample classic-v1: 2–4p, enter on 6, extra turn on 6, max 3 sixes, exact finish, no blockades, ~20s turn timer, 60s disconnect grace
- **Modes (CLOCK IN):** private room + quick match first; practice/bot offline OK but non-ranked
- **Bridge:** capability-scoped only (`host.ready`, scoped session, haptics, share.room, lifecycle, back) — never primary tokens / raw native
- **Aura vs ref non-goal:** ref sample excludes real-money/chain; **Aura keeps skill-escrow on Solana as host-only** — stake before WebView mount, payout on **server-attested** result; no casino/stake UI inside the board WebView
- **Fairness:** server RNG + event stream; commit-reveal/VRF can sit in match service later without changing the WebView

## ADR — Platform ops (phase 2, Sep 2026)
- **Long-run:** Developer Portal + Admin Console over shared control / artifact / analytics planes
- **Release model:** immutable signed versions; review state machine (DRAFT→…→LIVE→SUSPENDED→REMOVED); evidence-linked decisions; rollback
- **Analytics:** aggregate-first — no raw player IDs to studios
- **Identity:** org-scoped RBAC for studios; separate workforce IdP for admins
- **Build order:** playable Ludo · Chess · Snakes **first**; portal/admin **phase 2** after Free Play is solid
- **Near-term hook:** each `games/<id>/manifest.json` (version, entry, capabilities, assets) so we can grow into signed catalog later

## Kill rules
- No gambling UX copy
- No Phantom-only product path
- No full Steam clone for CLOCK IN

## Dev / wallet split (updated)
- Day-to-day: **Expo Go** — store shell + Ludo UI/realtime; **real Phantom** via deep-link / mobile connect (M1 gate)
- Native MWA (`SolanaMobileWalletAdapter`) **cannot load in Expo Go** — Seed Vault needs Seeker custom/EAS client
- **Auto-prefer Seeker** when that client is present; Phantom stays the fallback option
- Seed Vault + skill-escrow on Seeker client by **Sep 30**; CLOCK IN submit still Oct 8

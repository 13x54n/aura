# Aura — research brief

## Product lock
- Product title: **Aura** (not Playseek)
- First-party **Seeker game publisher** (thin store shell) + **staked skill Ludo** as first title
- Path: `/Users/lex-work/aura` (Expo app under `mobile/`)
- Long-run: store of *our* games; CLOCK IN demo = Ludo
- Event: **CLOCK IN** through **Oct 8, 2026**

## Loop
Create/join/random room → Solana skill-escrow stake → realtime Ludo → winner payout

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

## Kill rules
- No gambling UX copy
- No Phantom-only product path
- No full Steam clone for CLOCK IN

## Dev / wallet split (updated)
- Day-to-day: **Expo Go** — store shell + Ludo UI/realtime; **real Phantom** via deep-link / mobile connect (M1 gate)
- Native MWA (`SolanaMobileWalletAdapter`) **cannot load in Expo Go** — Seed Vault needs Seeker custom/EAS client
- **Auto-prefer Seeker** when that client is present; Phantom stays the fallback option
- Seed Vault + skill-escrow on Seeker client by **Sep 30**; CLOCK IN submit still Oct 8

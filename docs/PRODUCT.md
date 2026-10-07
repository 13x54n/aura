# Aura — product specification

**Name:** Aura  
**Home:** `/Users/lex-work/aura` (Expo app: `mobile/`. Mini-games are not in this repo.)  
**Repo:** https://github.com/13x54n/aura (private)  
**Platform:** Solana Mobile Seeker first — Expo **custom dev client** + MWA/Seed Vault for real wallet; Expo Go for UI/Free Play smoke (Phantom) only

## Vision

Aura is a **digital distribution platform** for Solana Seeker phone games: a glass store that discovers, launches, and governs **mini-games**. Every title is an Aura mini-game. This repository builds the platform only. Games are developed elsewhere and mounted from a URL in a WebView.

**Platform:** Android only (Seeker first), locked 2026-09-28.

We are **not** rebuilding the Solana dApp Store, and we are **not** a game studio inside this repo.

## North star (current)

An empty, honest store. Home, Arcade, and Search show no titles until a listing exists. A listing has remote art and an `entryUrl`. Play loads that URL. No bundled boards, no in-repo game source.

## Information architecture

| Tab | Role |
|-----|------|
| **Home** | Featured carousel when listings exist; otherwise an empty shelf. Continue only after a real open |
| **Arcade** | Full catalog of listed mini-games |
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

1. **IA** — App Store–for-games: Home · Arcade · Friends · Wallet · Search (floating frosted tab capsule)  
> **2026-09-28 (Lex):** Library tab replaced by **Wallet** (host-only): glass balance card, USDC/SOL/SKR, address + copy, Add funds / Withdraw, match ledger. Recently played lives in Home → Continue.

2. **Look** — dark + purple + glass; real `icon` / `cover` art (no letter tiles)  
3. **CTA** — **Play** only (never Get / Buy / price)  
4. **Wallet / escrow** — host chrome only; WebView never shows Connect or stake UI  
5. **Play path** — shelf/hero → short **glass** load (no white flash) → **full-bleed** WebView of `entryUrl` → **Back** returns to the shelf  
6. **In-board** — the mini-game’s own UI. Aura does not draw boards

## Kill rules

- No games developed in this repo  
- No fake / placeholder games on shelves  
- No casino framing; skill + escrow only (when stakes land)  
- No second wallet UI inside WebViews — host owns Connect  
- No Phantom-only product path (Seeker / Seed Vault remains default when available)

## Differentiation

| Competitor pattern | Aura |
|--------------------|------|
| Web wager lobbies | Seeker-native shell + Seed Vault |
| One-off game APKs | Catalog of mini-games loaded by URL + Host SDK |
| Token-gimmick titles | Clean skill-escrow, no junk token |

## Success metrics (product)

- Store opens on an empty catalog with no bundled game  
- A listing with `entryUrl` opens that URL in the WebView  
- Connect works on Expo Go (Phantom) and later Seed Vault on Seeker  
- Back from a mini-game restores the shelf (not a cold Home)

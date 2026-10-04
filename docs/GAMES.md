# Aura — games catalog

## Architecture Overview

**Aura is a marketplace of independent mini-apps, NOT a Ludo app with extras.**

Each game (Ludo, Chess, Snakes) operates independently with its own:
- Hub screen (deep or playable)
- Multiplayer configuration
- Escrow rules
- Game logic

See [GAME_REGISTRY.md](./GAME_REGISTRY.md) for the complete mini-app system documentation.

## Layout

```
games/
  ludo/     # mini-app + icon.png + cover.png + manifest.json
  chess/
  snakes/
mobile/src/runtime/          # packed HTML bundles Aura mounts
mobile/src/data/games/       # game registry configs
mobile/src/data/gameRegistry.ts  # pluggable game system
scripts/                     # pack-*.mjs
```

Aura **does not** embed game logic in RN screens long-term. It packs each mini-app and loads it in a WebView.

## Titles

Each game is independently configured via the Game Registry.

| ID | Status | Hub Type | Multiplayer | Escrow | Notes |
|----|--------|----------|-------------|--------|-------|
| `ludo` | **Deep** | Custom Hub | ✅ 2p/3p/4p | ✅ 1,3,5,10 USDC | Full rooms, quick match, server-authoritative |
| `chess` | **Playable** | Generic Hub | ❌ Planned | ❌ Planned | Free Play only, vs bot |
| `snakes` | **Playable** | Generic Hub | ❌ Planned | ❌ Planned | Free Play only, vs bot |

**Deep** = Custom hub with full room creation/join flows (like Ludo)  
**Playable** = Generic hub with Free Play button (Chess, Snakes)

## Packaging

- Pack scripts produce immutable HTML strings/assets for Metro  
- Smoke after pack: Free Play must show **board + moves**, not hub stubs  
- Icons/covers required in catalog — blank tiles are bugs  

## OSS policy

Prefer **MIT / Apache-2.0**. Record vendor + license in each `games/<id>/VENDOR.md`. Skip GPL for product path unless Legal clears.

## Manifest stub

Every game ships `manifest.json` (version, entry, capabilities, digest, draft status) so phase-2 portal can grow into signed review without rewiring the shell.

## OSS starters (MIT / clean)

| Game | Primary | Alt |
|------|---------|-----|
| Ludo | AmitThakur/ludo (vendored) | — |
| Chess | [GizzZmo/Chession](https://github.com/GizzZmo/Chession) (+ chess.js) | [usamagulzar/chex](https://github.com/usamagulzar/chex) |
| Snakes | [lemueldiergos/snake-and-ladder](https://github.com/lemueldiergos/snake-and-ladder) | [abp437/snake-and-ladders](https://github.com/abp437/snake-and-ladders) |

Skip GPL (e.g. mort3za/ludo) unless Legal clears. Record vendor + license in each `games/<id>/VENDOR.md`.

## Pack commands

```bash
node scripts/pack-ludo.mjs
node scripts/pack-chess.mjs
node scripts/pack-snakes.mjs
```

Outputs land under `mobile/src/runtime/` for Metro. Icons/covers also mirrored under `mobile/assets/games/<id>/`.

## Multiplayer roadmap

See [LUDO_MULTIPLAYER_ADR.md](./LUDO_MULTIPLAYER_ADR.md). Free Play direction (#1) gates rooms.

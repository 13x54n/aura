# Aura — games catalog

## Layout

```
games/
  ludo/     # mini-app + icon.png + cover.png + manifest.json
  chess/
  snakes/
mobile/src/runtime/   # packed HTML bundles Aura mounts
scripts/              # pack-*.mjs
```

Aura **does not** embed game logic in RN screens long-term. It packs each mini-app and loads it in a WebView.

## Titles

| ID | Free Play | Deep roadmap |
|----|-----------|--------------|
| `ludo` | Canvas board, Roll, tap Red, bots | Rooms, random match, host escrow |
| `chess` | White vs random Black | Rooms / rated later |
| `snakes` | 1–100 board, Roll, vs bot | Rooms later |

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

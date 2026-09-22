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

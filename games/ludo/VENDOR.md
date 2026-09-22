# Ludo mini-app (`games/ludo`)

Standalone HTML/Canvas Free Play package. Aura catalogs it and mounts it in a WebView via Host SDK — no wallet/escrow UI here.

## Provenance
- Board paint adapted from [AmitThakur/ludo](https://github.com/AmitThakur/ludo) (MIT) — see `LICENSE`.
- Piece movement, bots, touch Roll/Move, and Host close = Aura Free Play engine.
- Skipped DynamsoftRD/Modern-Ludo (no license on repo).

## Pack into mobile
```bash
node scripts/pack-ludo.mjs
```
Writes `mobile/src/runtime/ludoBundle.ts` for Expo `WebView` `source={{ html }}`.

Upstream  (dice/star) omitted — Free Play draws dice/stars on canvas.

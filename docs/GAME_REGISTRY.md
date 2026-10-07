# Aura catalog

Aura lists mini-games. It does not author them.

`mobile/src/data/catalog.ts` is the store record: title, art URLs, and `entryUrl`. `launchGame` opens `WebGame` only when `entryUrl` is set. The catalog is empty until a listing is added.

`mobile/src/data/gameRegistry.ts` can hold optional host metadata (multiplayer, escrow) for a listing. It does not point at in-repo game source, and nothing is registered today.

Do not add a `games/` package, a hub screen, or a pack script in this repo. Ship the mini-game elsewhere and point a listing at its URL.

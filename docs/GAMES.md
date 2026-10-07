# Aura — mini-games

Aura is the Solana Seeker distribution platform. Every title it distributes is an Aura mini-game: an untrusted package the host mounts in a WebView from a URL.

This repository does not develop games. There is no `games/` tree, no pack script, and no bundled HTML.

## How a title shows up

A store listing in `mobile/src/data/catalog.ts` (`AURA_GAMES`) carries remote art and an `entryUrl`. Play navigates to `WebGame`, which loads that URL and injects `window.AuraHost`. Until a listing exists, Home, Arcade, and Search show an empty shelf.

Mini-games are built and hosted outside this repo. They talk to the host only through the [Host SDK](./HOST_SDK.md).

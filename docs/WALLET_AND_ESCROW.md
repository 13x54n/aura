# Aura — wallet & escrow

## Wallet

| Context | Behavior |
|---------|----------|
| Seeker custom client | **Seed Vault / MWA** preferred — auto when present |
| Expo Go / Mac | **Real Phantom** connect (universal / deep link) |
| Expo Go limit | Native MWA (`SolanaMobileWalletAdapter`) **cannot load** — Seed Vault needs Seeker custom/EAS client |
| WebView | **No** Connect UI — call host capability only |

Product kill: Phantom-only as the forever path. Seed Vault remains the Seeker default.

## Escrow (skill, not casino)

- Stake + payout live on the **host**, not in game HTML  
- Flow: Connect → Lock stake (host) → mount WebView with `matchId` → play → host pays on **server-attested** result  
- Free Play skips escrow  
- Frame as **skill + escrow**; fair dice via commit-reveal / VRF on server when multiplayer ships  

## Capability split

| Capability | Owner |
|------------|--------|
| `wallet.getAddress` (triggers host Connect) | Host bridge |
| Escrow lock / payout UI | Host screens (not bridge) |
| `escrow.status` | Host bridge (read-only) |
| `match.create` / `match.get` / `match.command` | Host `MatchService` stub → remote later |
| Board render | Mini-app |

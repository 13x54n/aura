# Aura — wallet & escrow

## Wallet

| Context | Behavior |
|---------|----------|
| Seeker custom client | **Seed Vault / MWA** preferred — auto when present |
| Expo Go / Mac | **Real Phantom** connect (universal / deep link) |
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
| `wallet.connect` | Host |
| `escrow.lock` / `escrow.payout` | Host |
| `match.join` / `roll` / `move` | Match service via bridge |
| Board render | Mini-app |

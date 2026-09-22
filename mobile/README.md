# Aura (CLOCK IN)

First-party **Seeker** game publisher — thin shelf of *our* games, not a second dApp Store catalog.

**Aura news app is parked.** This repo is the new product.

## Product lock

| Item | Lock |
| --- | --- |
| Long-run | First-party Seeker game publisher |
| CLOCK IN demo | **Staked Ludo** — create / join / random match |
| Money flow | Solana **skill-escrow** (stake in → winner payout) |
| Framing | **Skill + escrow** — NOT casino / gambling / prediction markets |
| Store shell | Home with **one** live tile: Ludo + “Coming soon” |
| Wallet | **Seeker Seed Vault first** via Mobile Wallet Adapter |

### Wedge notes (later)

- Seed Vault one-tap via MWA (Milestone 1 on Seeker)
- SGT one-device / one-account
- Commit-reveal / VRF dice

## Milestones in this scaffold (1–3)

1. Expo RN + MWA Connect Wallet (**custom destin client** — not Expo Go)
2. Store shell Home: Aura title, wallet connect, Ludo card, Coming soon
3. Ludo flow stubs: Create / Join / Random (+ Escrow stub with skill-match copy)

Escrow PDA/tx and realtime matchmaking are **stubs** on purpose — lean for the Oct 8 deadline.

## Repo path

App lives at `/Users/lex-work/aura/mobile`. Leave Aura root `README.md` / `RESEARCH.md` intact.

## Package id

- Android / iOS: `com.aura.app`

## Wallet UX (important)

- Primary button label: **Connect Seed Vault**
- On Seeker hardware, connect with **Seed Vault** (Milestone 1 requirement)
- Any MWA wallet (e.g. **Phantom**) works for **Mac / emulator smoke-tests only** — do not ship Phantom-only flows

## Prerequisites

- Node **v25** preferred (template also runs on modern Node; box scaffold used yarn + engine ignore)
- Android SDK / device or emulator
- **Expo custom development build** (`expo-dev-client`) — MWA will **not** work in Expo Go
- On Seeker: Seed Vault. On emulator: an MWA wallet (Phantom OK for smoke)

## How to run

```bash
cd /Users/lex-work/aura/mobile   # or this checkout
yarn install                  # prefer yarn (Solana Mobile template guidance)

# Local native build (custom destin client)
yarn android                  # → expo run:android
# or
npx expo run:android

# Dev server against an already-installed dev client
yarn start                    # → expo start --dev-client
```

### EAS development build

```bash
yarn build        # eas build --profile development --platform android
yarn build:local  # same, --local
```

`eas.json` already enables `developmentClient: true` for the `development` profile.

## Smoke-test checklist (MAT)

1. **Install custom destin client** (`expo run:android` or EAS). Confirm app id `com.aura.app`.
2. **Connect Wallet**
   - Tap **Connect Seed Vault** on Home.
   - On Seeker: approve with Seed Vault.
   - On Mac emulator: Phantom (or any MWA wallet) is OK for this smoke only.
3. **Store shell**
   - Title **Aura**
   - One **Ludo** game card + **Coming soon** card/tab
4. **Ludo room stubs**
   - Open Ludo → Create room / Join / Random match screens navigate
   - Each path reaches **Skill match escrow** with stake field + stub PDA/tx buttons
   - Copy says skill + escrow (no casino chrome)

## Repo hygiene

- Local git only for this scaffold — **do not push** unless Lex asks
- Do **not** wipe `/Users/lex-work/aura`

## Layout

```
aura/
  App.tsx
  app.json                 # com.aura.app
  eas.json                 # developmentClient
  package.json
  README.md
  CLOCK_IN.md              # product notes
  src/
    components/sign-in/    # Seed Vault–first connect
    navigators/            # tabs + Ludo/escrow stack
    screens/
      HomeScreen.tsx       # store shell
      ComingSoonScreen.tsx
      ludo/
        LudoHubScreen.tsx
        CreateRoomScreen.tsx
        JoinRoomScreen.tsx
        RandomMatchScreen.tsx
        EscrowScreen.tsx   # skill-escrow stub
    utils/                 # MWA authorize + mobile wallet hooks
```

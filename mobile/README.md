# Aura (CLOCK IN)

Solana Seeker **game store**. Mini-games are loaded from a URL. This app does not contain game source.

## Product lock

| Item | Lock |
| --- | --- |
| Long-run | Seeker digital distribution platform |
| Catalog | Empty until a listing has an `entryUrl` |
| Money flow | Solana **skill-escrow** (host only) |
| Framing | **Skill + escrow** — NOT casino / gambling / prediction markets |
| Store shell | Home · Arcade · Friends · Wallet · Search |
| Wallet | **Seeker Seed Vault first** via Mobile Wallet Adapter |

### Wedge notes (later)

- Seed Vault one-tap via MWA (Milestone 1 on Seeker)
- SGT one-device / one-account
- Commit-reveal / VRF dice

## Milestones in this scaffold (1–3)

1. Expo RN + MWA Connect Wallet (**custom destin client** — not Expo Go)
2. Store shell: Home, Arcade, Friends, Wallet, Search
3. Empty catalog. A later listing opens its `entryUrl` in the WebView

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
   - Home, Arcade, and Search show an empty catalog (no bundled game)

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
    navigators/            # store tabs + WebGame
    screens/               # Home, Arcade, Friends, Wallet, Search
    runtime/WebGameScreen.tsx  # mounts a listing entryUrl
    utils/                 # MWA authorize + mobile wallet hooks
```

## Expo Go (SDK 57)

Day-to-day: open with Expo Go on phone (SDK 57). Phantom deep link for wallet smoke. Real Seed Vault / MWA needs a Seeker custom client (Android-only).

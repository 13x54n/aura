# Aura: local development

This doc gets you from a fresh checkout to playing a **Ludo room on your phone**.

> **Do I need a server?** Only for rooms. **Free Play** runs entirely in the app.
> **Create private**, **Join with code** and **Quick match** all need the **match server** (`server/match-server.mjs`).
> Until it's hosted, it runs on your Mac, and your phone must be on the **same Wi-Fi**.

| Feature | Needs match server? |
|---|---|
| Free Play (vs bots) | No |
| Create private / Join with code / Quick match | **Yes** |
| Hub, Wallet, balance card | No (the wallet needs Connect) |

---

## 1. Quick start (one command)

```bash
cd ~/aura/mobile
npm run dev
```

This starts the match server on port `3001` together with `expo start -c`, and sets `EXPO_PUBLIC_MATCH_SERVER_URL` to your Mac's network address.
Scan the QR code with **Expo Go** on your phone. Then tap **Ludo**. You should land on the **Ludo hub**.

The first run installs the match server's own dependency (`ws`) into `server/node_modules`.
Press `Ctrl+C` once to stop both the server and Expo.

- To force an address, run `MATCH_HOST=192.168.1.20 npm run dev`.
- To use another port, run `PORT=4000 npm run dev`.
- If the port is taken, the script says so and exits. Run `lsof -i :3001` to see what's using it.

---

## 2. Prerequisites

- **Node.js 20 or newer.** The Mac currently has v25.
- **Git** and this repo checked out at `~/aura`. Always run from **this** checkout (see Troubleshooting).
- **Expo Go** on your phone, for UI testing and Free Play.
- For the **real wallet** path: an Android / Seeker device with a custom dev client (`npm run android`, which runs `expo run:android`) and Mobile Wallet Adapter (MWA) / Seed Vault. Expo Go can't do MWA.
- **Optional:** the Xcode iOS Simulator or an Android Emulator.

## 3. Install

```bash
cd ~/aura/mobile
npm install
```

The match server has its own `server/package.json` with `ws` as its only dependency.
`npm run dev` and `npm run match-server` both install it automatically. To install it by hand, run `npm install --prefix ~/aura/server`.

## 4. Manual start (two terminals)

**Terminal A: the match server**

```bash
cd ~/aura/mobile
npm run match-server          # installs server deps if needed, then runs node ../server/match-server.mjs
```

- Port: `3001`. Override it with `PORT=4000 npm run match-server`.
- It listens on `0.0.0.0`, meaning every network interface, so your phone can reach it at the Mac's network address.
- Turn clock: 20 seconds by default. Override it with `TURN_MS=10000`.

**Terminal B: Expo**

```bash
cd ~/aura/mobile
npx expo start -c             # -c clears the Metro cache
```

### How the app finds the server

`mobile/src/match/MatchClient.ts` picks the address in this order:

1. `EXPO_PUBLIC_MATCH_SERVER_URL`, if it's set. For example `ws://192.168.1.20:3001`, or `wss://…` once hosted.
2. Otherwise, the network address Expo is serving from. This usually just works in Expo Go on the same Wi-Fi.
3. Otherwise, `localhost` on the iOS Simulator or `10.0.2.2` on the Android Emulator.

To pin it explicitly:

```bash
ipconfig getifaddr en0        # → e.g. 192.168.1.20
EXPO_PUBLIC_MATCH_SERVER_URL=ws://192.168.1.20:3001 npx expo start -c
```

`EXPO_PUBLIC_*` values are baked in when Metro bundles the app, so restart with `-c` after you change one.

## 5. Phone vs simulator

| Target | How | Server address |
|---|---|---|
| Phone (Expo Go) | Scan the QR code, same Wi-Fi | Auto (the Mac's network address), or the env var |
| iOS Simulator | Press `i` in the Expo terminal | `localhost:3001` |
| Android Emulator | Press `a` | `10.0.2.2:3001` |
| Seeker / real wallet | `npm run android` (dev client) | The env var is recommended |

## 6. Test a 2p / 3p / 4p room on one Mac

You need one client per seat.

- **Phone + simulator(s):** on the phone, open Ludo hub → **Create private** → pick 2, 3 or 4 players → **Create table**, and note the code. On the simulator: **Join with code** → enter the code. Repeat until every seat is filled. The match starts only when all seats are taken.
- **Quick match** is always 2 players. Two clients tapping Quick match at the same stake get paired together.
- **Headless checks** (no UI):
  ```bash
  cd ~/aura && node server/test-room.mjs && node server/test-multiplayer-sim.mjs
  ```

What to expect:
- **Seats:** a 3p room uses Red, Green and Blue (seats `[3,2,0]`). The 4th corner shows as an empty, dimmed seat.
- **Idle turns:** if nobody taps, the server's turn clock plays the turn after 20 seconds.
- **Drops:** if a player drops, their seat is held for 30 seconds ("Reconnecting… 0:30"). If they don't come back, they forfeit. Tap Retry within that window to take your seat back. The server plays your turn if it comes up while you are away.

## 7. Rebuild the Ludo bundle

The board runs from a packed HTML string, not straight from `games/ludo/`. After editing `games/ludo/{index.html,style.css,game.js}`:

```bash
cd ~/aura && node scripts/pack-ludo.mjs     # writes mobile/src/runtime/ludoBundle.ts
```

Then reload the app. Chess and Snakes work the same way, with `scripts/pack-chess.mjs` and `scripts/pack-snakes.mjs`.
Move speed can be tuned with `HOP_MS` (200) and `LAND_MS` (160) at the top of `games/ludo/game.js`.

## 8. Troubleshooting

**"Can't reach match server"**
1. Is Terminal A running? You should see the server log on port 3001.
2. Are the phone and the Mac on the same Wi-Fi? Guest or isolated networks often block device-to-device traffic.
3. Pin the address: `EXPO_PUBLIC_MATCH_SERVER_URL=ws://$(ipconfig getifaddr en0):3001 npx expo start -c`.
4. Check the macOS firewall (System Settings → Network → Firewall) and allow incoming connections for `node`.
5. From the phone's browser, open `http://<mac-ip>:3001`. Any response at all means the port is reachable.

**"Table not found" / "Table is full"**
The code is wrong or already used, or the room has every seat taken. Go back to the hub and create a new table.

**Old screens / the new hub doesn't show (stale bundle)**
- Restart with `npx expo start -c`.
- In Expo Go, shake the phone → Reload. If that doesn't help, delete the project from Expo Go's recents.
- If you edited the game, run `node scripts/pack-ludo.mjs` first.

**Wrong checkout**
- The new work lives in `~/aura` on the Mac. Run `git -C ~/aura log --oneline -1` and compare it with what the team last reported.
- A clone on another machine, or a fresh clone from GitHub, has only what's been pushed. Push from `~/aura` first, then pull elsewhere.

**Port already in use**
`lsof -i :3001` → `kill <pid>`, or start the server on another port with `PORT=3002` and set `EXPO_PUBLIC_MATCH_SERVER_URL` to match.

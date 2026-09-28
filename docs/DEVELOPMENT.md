# Aura: local development

> **Platform: Android only** (Seeker first), locked 2026-09-28. There are no iOS builds, iOS testing or iOS fixes.

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
- **Expo Go** on your Android phone (Seeker or any other). **This is the default build** for everything, including rooms, the wallet and stakes.
- **Phantom** on the same phone, set to **Devnet**. It's the wallet in Expo Go, through a deep link.
- **Rule:** nothing may break Expo Go, so no custom native modules and only packages that work in Expo Go (SDK 57).
- **Future, optional:** a custom dev client (`npm run android`, which runs `expo run:android`) for Mobile Wallet Adapter (MWA) / Seed Vault. It isn't needed for any current gate.
- **Optional:** an Android Emulator (Android Studio).

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
- Turn clock: 20 seconds by default (one clock covers the roll and the move). Override it with `TURN_MS=10000`.
- Reconnect grace: 30 seconds by default. Override it with `GRACE_MS=10000`, which is handy for testing drops quickly.
- Heartbeat: the server pings every 10 seconds by default. Override it with `HEARTBEAT_MS`.
- Match history is saved to a JSON file (the last 5000 matches). Point it somewhere else with `HISTORY_FILE=/path/history.json`.
- Forfeits are remembered for 30 minutes in `forfeits.json`, next to the history file, so they survive a server restart. Point it somewhere else with `FORFEITS_FILE=/path/forfeits.json`.
- `ESCROW_LIVE=1` allows real stakes. Leave it unset for now, which forces every stake to 0 on the server. Don't set it until gate 3 passes.
- Stakes are forced to 0 on the server until escrow ships, so every room is a "Friendly · no stake" table.

**Terminal B: Expo**

```bash
cd ~/aura/mobile
npx expo start -c             # -c clears the Metro cache
```

### How the app finds the server

`mobile/src/match/MatchClient.ts` picks the address in this order:

1. `EXPO_PUBLIC_MATCH_SERVER_URL`, if it's set. For example `ws://192.168.1.20:3001`, or `wss://…` once hosted.
2. Otherwise, the network address Expo is serving from. This usually just works in Expo Go on the same Wi-Fi.
3. Otherwise, `10.0.2.2` on the Android Emulator (`localhost` is only a code fallback).

To pin it explicitly:

```bash
ipconfig getifaddr en0        # → e.g. 192.168.1.20
EXPO_PUBLIC_MATCH_SERVER_URL=ws://192.168.1.20:3001 npx expo start -c
```

### Solana RPC (429s)

The app uses the public devnet RPC by default, and it rate-limits with `429` errors. To avoid that, put a free dedicated devnet key (Helius or QuickNode) in `mobile/.env`:

```
EXPO_PUBLIC_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=<your key>
```

The app shares one `Connection` and caches balances per wallet for 20s. They refresh when a screen opens and on pull-to-refresh. On a `429` the app backs off quietly (2–60s) and keeps showing the last balance. Once that balance is more than 20s old, a muted "Updated Xm ago" line appears under it.

The escrow side (`server/escrow.mjs` and `escrow/scripts/devnet-setup.mjs`) reads its own `SOLANA_RPC` variable, which defaults to the public devnet RPC, so it never shares the app's rate limit. Use a different key there, for example `SOLANA_RPC=https://devnet.helius-rpc.com/?api-key=<second key>`.

`EXPO_PUBLIC_*` values are baked in when Metro bundles the app, so restart with `-c` after you change one.

## 5. Phone vs emulator

| Target | How | Server address |
|---|---|---|
| Phone (Expo Go) | Scan the QR code, same Wi-Fi | Auto (the Mac's network address), or the env var |
| Android Emulator | Press `a` | `10.0.2.2:3001` |
| Future dev client (MWA / Seed Vault) | `npm run android`, optional and not needed today | The env var is recommended |

## 6. Test a 2p / 3p / 4p room on one Mac

You need one client per seat.

- **Phone + emulator(s):** on the phone, open Ludo hub → **Create private** → pick 2, 3 or 4 players → **Create table**, and note the code. On the emulator: **Join with code** → enter the code. Repeat until every seat is filled. The match starts only when all seats are taken.
- **Quick match** pairs real players only, by **stake and table size**. Everyone is on 0 USDC until escrow ships. "Finding a table…" stays up until a match is found. After 60 seconds it offers Keep waiting or Back to hub, and it never adds bots.
- **Headless checks** (no UI). These only check seat constants and rules, not a live server, so still test with real clients:
  ```bash
  cd ~/aura && node server/test-room.mjs && node server/test-multiplayer-sim.mjs
  ```

What to expect:
- **Leaving:** on a live room board, hardware back, the back gesture and the X all open a "Leave match?" sheet. **Keep playing** is the default. **Leave & forfeit** ends your seat, and on a staked table the sheet names the stake you'd lose. Free Play and finished boards close straight away.
- **Seats:** a 3p room uses Red, Green and Blue (seats `[3,2,0]`). The 4th corner shows as an empty, dimmed seat.
- **Idle turns:** if nobody taps, the server's turn clock plays the turn after 20 seconds.
- **Drops:** if a player drops, their seat is held for 30 seconds ("Reconnecting… 0:30"). If they don't come back, they forfeit. Within that window, tap Retry on the "Connection lost" card to take your seat back. If the app was reloaded or killed, go back through the Ludo hub's **Rejoin** tile or **Join with code** instead. Your seat is still yours because your `playerId` is saved on the device (`aura.match.playerId`). The server plays your turn if it comes up while you're away. If the window has already run out, your seat is gone and you'll see "You forfeited this match". The app pings every 5 seconds and treats 15 seconds of silence as a drop. The server pings every `HEARTBEAT_MS` (10 seconds by default) and closes sockets that go silent. Either way, a silent Wi-Fi drop starts the grace period right away.

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
The code is wrong or the table has ended, or every seat is taken. Go back to the hub and create a new table.

**"You forfeited this match"**
You tapped Leave (and confirmed the forfeit), or your seat's 30-second grace period ran out, so that seat left the match. Start or join a new table.

**"Table code in use"**
You tried to create a table with a code a live table already has. This card has no Retry button. Go back to the hub and create again to get a fresh code. If you were already seated at that table, use the **Rejoin** tile or **Join with code**.

**Old screens / the new hub doesn't show (stale bundle)**
- Restart with `npx expo start -c`.
- In Expo Go, shake the phone → Reload. If that doesn't help, delete the project from Expo Go's recents.
- If you edited the game, run `node scripts/pack-ludo.mjs` first.

**Wrong checkout**
- The new work lives in `~/aura` on the Mac. Run `git -C ~/aura log --oneline -1` and compare it with what the team last reported.
- A clone on another machine, or a fresh clone from GitHub, has only what's been pushed. Push from `~/aura` first, then pull elsewhere.

**Port already in use**
`lsof -i :3001` → `kill <pid>`, or start the server on another port with `PORT=3002` and set `EXPO_PUBLIC_MATCH_SERVER_URL` to match.

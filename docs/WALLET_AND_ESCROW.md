# Aura — wallet & escrow

## Wallet

**Seeker path (product):** Expo **custom development build** + Mobile Wallet Adapter → Seed Vault (`expo run:android`). Expo Go is UI/smoke only (Phantom). Scaffold reference: Solana Mobile `create-solana-dapp` / RN Expo docs.


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

---

## Escrow v1: on-chain room vault (gate 3, locked 2026-09-28)

**Scope:** devnet USDC only. Stake chips are 1 / 3 / 5 / 10 USDC. The fee is **5% of the pot**. 0 USDC "Friendly" tables skip the program entirely.

### Reuse check: should we adopt an audited program?

| Candidate | Audited? | Fit for N-player winner-takes-pot? | Verdict |
|---|---|---|---|
| [solana-foundation/escrow](https://github.com/solana-foundation/escrow) | Yes (Accretion) | No. Built for depositors withdrawing their own receipts after a timelock or hook. Paying a winner would need a custom hook, which is unaudited code anyway. | Borrow patterns (receipts, mint allowlist, Token-2022 extension blocking), don't adopt |
| [Anchor escrow examples](https://github.com/qiaopengjun5162/solana_anchor_escrow) (make / take / refund) | No | Two-party swap only | Reference for vault ATA and `transfer_checked` |
| [totdking wager-program](https://github.com/totdking/solana-wager-contract) | Community review found **2 critical issues** (duplicate accounts in payout, trust in a malicious game server) | Closest shape | Don't reuse. Use its audit findings as our checklist |
| Squads / Streamflow | Yes | Multisig and vesting, not match settlement | No |

**Decision:** write a small Anchor program of about 300 lines, `aura_escrow`, following the audited patterns above. Don't fork. Get it audited before mainnet.

### Accounts

| Account | Seeds | Holds |
|---|---|---|
| `Config` | `["config"]` | `admin`, `settle_authority` (the match server's key), `fee_bps = 500` (capped at 500), `treasury` (a USDC token account), `usdc_mint`, `paused` |
| `Room` | `["room", room_id]` (a 16-byte id) | `stake`, `seats` (2 to 4), `players[4]`, `deposited` (bitmask), `status` (Open, Locked, Settled or Refunded), `dice_commit` (32 bytes), `deposit_deadline`, `settle_deadline`, `winner` |
| Vault | The associated token account (ATA) for `usdc_mint` owned by the **Room PDA** | The pot. Only program-signed transfers can move it |

The server pays rent for `Room` and the vault, and gets it back when they close.

### Instructions

1. **`init_config`** is run once by the admin. It must check the program's **upgrade authority** so nobody can front-run initialization, which was a Zealynx finding on a similar vault.
2. **`init_room(room_id, stake, seats, dice_commit, deposit_deadline)`** is signed by `settle_authority`. It creates `Room` and the vault with status `Open`.
3. **`deposit(seat)`** is signed by the player through MWA / Seed Vault, or Phantom on Expo Go. It moves `stake` USDC from the player's ATA into the vault with `transfer_checked`. It rejects a seat that's already filled, the same wallet taking two seats, and any deposit after the deadline. When every seat has deposited, status becomes `Locked` and `settle_deadline = now + 2h`.
4. **`settle(winner_seat, result_hash, dice_seed)`** is signed by `settle_authority`, only while status is `Locked`. It checks that `sha256(dice_seed) == dice_commit`. It pays `pot − fee` to the **winner's ATA**, which must belong to a seated depositor, and `fee` to `treasury`. It emits `Settled{room_id, winner, result_hash}` and closes the vault and `Room`.
5. **`refund`** returns each deposit to its own depositor. There are three ways to trigger it:
   - The server signs a cancel while status is `Open`. This covers a table that doesn't fill or a match that never starts.
   - Anyone can trigger it once `deposit_deadline` has passed and the room is still `Open`.
   - Anyone can trigger it once `settle_deadline` has passed and the room is `Locked`, meaning the server never settled. This is what guarantees **funds can never get stuck**.

   Refund recipients are passed as extra accounts. The program **checks each one against `players[]` and rejects duplicates**, which was the critical issue in the wager-program audit.

**Fee math** (USDC has 6 decimals): `pot = stake × seats`, `fee = pot × 500 / 10_000` (rounded down), `winner = pot − fee`. For example, 2 players at 5 USDC is a 10 USDC pot, a 0.50 fee and **9.50 to the winner**. 4 players at 1 USDC is a 4 pot, a 0.20 fee and 3.80 to the winner.

### As built: review decisions (v1.1, 2026-09-28)

These rules come from the program review (up to `34430f3`) and Business Management's decisions. Where they conflict with the v1 text above, they win. Items marked **pre-deploy** must land before the devnet deploy.

- **The referee is fully trusted to name the winner.** The program checks *who* can be paid, never *who won*. Honesty comes from the dice commit, the replayable log and the timeout refund, not from the chain. Say this plainly to players.
- **Fee:** `fee_bps` is capped at **500 (5%) on-chain**. `init_config` and `update_config` reject anything higher. (The first build allowed up to 10%; that's changed.)
- **Stakes:** only **1 / 3 / 5 / 10 USDC** are accepted, enforced in both `init_room` and `server/escrow.mjs`. **Pre-deploy.**
- **Seats are bound at `init_room`.** The server signs each seat to the wallet of the player who joined it, and `deposit` rejects any other wallet, so a stranger can't squat a seat and force a refund. If a player changes wallets, the server cancels and re-inits the room. Seats can't be edited.
- **Dice seed:** each roll comes from the server's committed seed **mixed with the slot hash at lock time**, so the server can't know the rolls when it commits. Per-player nonces are deferred to mainnet. **Pre-deploy.**
- **Payout:** `settle` pays from `stake × seats`, not the vault balance. Stray tokens sent straight to the vault get swept to the treasury, on settle or refund. **Pre-deploy.**
- **Deadlines:** a match has a hard **60-minute** limit inside the 2h `settle_deadline`. Settle retries early, and an alert fires at 90 minutes after lock. After `settle_deadline`, settle is rejected and only refund remains. **Pre-deploy.**
- **Referee refund of a locked room:** allowed only **before the first roll**, or with a **reason code** that's recorded in the `Refunded` event. Refunds only ever pay depositors.
- **Key separation:** `update_config` repeats `init_config`'s check that the settle key can't own the treasury account, so the server never holds USDC. **Pre-deploy.**
- **Sending transactions:** after an unclear timeout, `send()` checks whether the first signature landed before building a new one, so a settle that paid out is never reported as failed. **Pre-deploy.**
- **RPC guard:** scripts parse `SOLANA_RPC` as a URL and refuse public devnet whatever the case, query string, or `devnet` shorthand. **Pre-deploy.**
- **Buffers:** close orphaned deploy buffers by address only (`solana program close <BUFFER_ADDRESS>`). Never use `--buffers`, which closes every buffer owned by the key.

### How settlement is proven

- **The server can't take custody.** The vault belongs to the Room PDA. `settle` can only pay a seated depositor plus the configured treasury, and `refund` can only pay depositors. The settle key alone can't send funds to anyone else.
- **The server is the referee, and we say so plainly.** It decides the winner. To keep that honest:
  1. **Dice commit-reveal.** At `init_room`, the server commits `sha256(seed)`, and every die roll is derived from `seed` plus the turn number. `settle` reveals the seed, and the program checks it against the commit.
  2. **A replayable log.** `result_hash = sha256(room_id ‖ ordered move log ‖ final standings)` goes into the `Settled` event. The server publishes the log at `/matches/:id/log`, and anyone can replay it using Rule Book v1.0 to reach the same winner.
  3. **Timeout refund.** If the server goes silent, anyone can trigger the refund, so the server can't stall funds either.
- **Forfeits and grace-period expiry** settle as a loss for that seat, which is the existing server rule. The log records the forfeit event.

### Server and app wiring

- The server builds the `deposit` transaction, which also creates the player's ATA if it's missing. The host wallet signs it, and the app never signs anything that doesn't come from the host. A seat becomes **Ready only after the server reads `Room.deposited` on-chain** at `confirmed` or stronger. It checks chain state and doesn't take a transaction signature as proof.
- Result shows the real receipt: pot, fee, payout, and a link to the `settle` transaction on the explorer (devnet cluster). Wallet history reads the player's deposit, payout and refund transactions.
- `settle_authority` is kept in server secrets (an environment variable or a key management service), never in the repo. It's rotated with an admin-signed `set_settle_authority`.
- The devnet USDC mint is `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (Circle's devnet mint). Confirm it before wiring. Test wallets get funds from faucet.circle.com.

### Before mainnet

External audit of `aura_escrow`, a pause switch that's been tested, a **verified reproducible build** (Docker `solana-verify build`, plus `verify-from-repo` from a public program repo for the explorer badge), and **legal review**.

> **Devnet deploy plan (2026-09-28, Lex):** not deployed yet; it's waiting on a dedicated `SOLANA_RPC`. It'll deploy from a normal `anchor build` without Docker. What's deployed will be checked against the local build by matching the hashes from `solana-verify get-executable-hash` and `get-program-hash`. Keys are in `~/.config/aura/` on the Mac, gitignored. Real-money skill contests are regulated differently by province and state; Lex is in Canada. Until those three pass, it stays devnet only.

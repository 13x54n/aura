# Ludo Rule Book v1.0

**Status:** Canonical — Lex lock 2026-09-23  
**Audience:** Product, Design, Client (`games/ludo`), Match service, QA  
**Companion:** [LUDO_MULTIPLAYER_ADR.md](./LUDO_MULTIPLAYER_ADR.md)

Product default, not universal law. Regional variants exist; this guide **fixes** ambiguity so every agent builds the same game. Rule changes must update config, tests, and help text together.

## At a glance

| Item | Value |
|------|-------|
| Players | 2–4 |
| Tokens | 4 per player |
| Die | 1× d6 |
| Entry | Roll **6** → yard → **own start cell** (does **not** advance 6 spaces) |
| Move | One legal token by exact die value, **clockwise** on shared track |
| Capture | Land on opponent on non-safe cell → yard; **passing does not capture** |
| Safe | Board-defined; cannot capture there |
| Friendly | May share a cell; **no blockades** |
| Bonus | One bonus roll after **6**, **capture**, or **home** (only one even if multiple triggers) |
| Three 6s | Third consecutive 6 ignored; no move; turn ends |
| Win | First to home all four tokens; match ends immediately |

## 01 — Player rules

### Objective and setup

- Each player controls one color; four tokens start in that color’s **yard**.
- Turns proceed **clockwise**. First player random unless room overrides.
- Token route: **yard → start cell → shared track → color home lane → home**.
- First player to home all four wins; stop match after the winning move.

### Starting a token

- Leave yard **only** on a roll of **6**.
- Placement is on the color’s **start cell** — not a six-step advance.
- If start is occupied by opponent: capture unless cell is **safe** (then both remain).

### Moving

- After roll, player picks one **highlighted legal** token.
- Track tokens advance **clockwise** by die value.
- Enter **own** home lane only after completing shared track.
- **Exact** remaining value required to reach home; cannot overshoot.
- If no legal token, move is skipped automatically.

### Capture and safe cells

- Ending on a non-safe cell with opponent(s) captures them → yard.
- Passing over never captures.
- Safe cells: identified by **board data**, clear marker in UI; no capture.
- Friendly stacking allowed; no blockades in this ruleset.
- Multiple opponents on one non-safe cell: one landing captures all (should be rare).

### Bonus rolls

- One bonus roll after: rolling a 6, capturing ≥1 opponent, or moving a token into home.
- Only **one** bonus per move even if multiple triggers.
- Three consecutive 6s in the same turn: ignore third roll, no move, pass turn.
- Capture/home does **not** reset consecutive-6 count; a non-6 roll does.

### Disconnects / inactivity

- Keep match state across reconnect.
- Turn timer expiry → auto-select legal move via documented deterministic policy; else pass.
- Forfeit only after configured disconnect limit — never from one missed turn.

### Visibility

Show legal tokens **only after** the die result is **committed** by the authoritative service. Client must never preview/submit against an unaccepted die value.

## 02 — Turn engine

### Sequence

1. **Start turn** — set active player; clear pending roll / legal moves  
2. **Commit roll** — server generates or validates 1–6; update six streak  
3. **Find moves** — evaluate every token against committed value  
4. **Apply move** — move one token; resolve capture, home, events  
5. **Continue** — one bonus roll **or** next player  

Client renders state and submits an allowed token choice; it **never** decides the result.

### Legal move order

1. If third consecutive 6 → no legal moves; end turn  
2. Yard tokens: entry only when roll is 6  
3. Active tokens: compute route-relative destination  
4. Reject past home / outside route  
5. Safe or friendly OK; else mark opponents for capture  
6. Return stable token ids, destinations, capture previews  

### Invariants

- Exactly one active player while in progress  
- Each token in exactly one place: yard | track | home lane | home  
- Progress never decreases except capture → yard  
- Selected token must be in current legal set  
- Every accepted action bumps state version once  
- Completed matches accept no further rolls/moves  

### RuleProfile (`classic-v1`)

```json
{
  "profileId": "classic-v1",
  "tokensPerPlayer": 4,
  "entryRoll": 6,
  "exactRollToHome": true,
  "safeCells": ["board-defined"],
  "friendlyStacking": true,
  "blockades": false,
  "bonusOnSix": true,
  "bonusOnCapture": true,
  "bonusOnHome": true,
  "maxConsecutiveSixes": 3
}
```

Version layout + ruleset together. Never mutate a profile already referenced by a live match — publish `classic-v2`.

### Turn-end decision

| Condition | Result |
|-----------|--------|
| Third consecutive 6 | Pass immediately |
| Win reached | End match |
| Any bonus trigger | Same player rolls |
| No legal move | Pass |
| Normal move | Next player |

## 03 — Agent build guide

| Agent | Owns |
|-------|------|
| Product | Ruleset version, variants, timers |
| Game logic | Legal moves, transitions, win |
| Backend | Rooms, authority, persistence, reconnect |
| Client | Board, input, animation, a11y |
| QA | Rule matrix, desync, abuse, recovery |

### Minimum modules

- **Board model** — ordered routes, start cells, safe cells, home lanes  
- **Rules core** — pure functions: legal moves + apply one move  
- **Match service** — room lifecycle, turn timer, state version, command validation  
- **Event log** — roll committed, token moved, captured, homed, turn advanced, match won  
- **Client view** — highlights/messages/animation from authoritative events  

### Commands

```
ROLL  { matchId, playerId, stateVersion }
MOVE  { matchId, playerId, tokenId, stateVersion, commandId }
RESULT { accepted, newVersion, events[], publicState }
```

`commandId` for idempotency. Reject stale versions, wrong players, duplicates, illegal tokens.

### UX requirements

- Show turn owner, die, timer, all four token states without another screen  
- Highlight only legal tokens; disable roll while move pending  
- Animate from accepted events, then reconcile to public state  
- Plain-text explanations for skips, captures, third-six, reconnect, forfeit  
- Do not rely on color alone (shapes/labels/patterns)  

### Sync / recovery

Monotonic `stateVersion` on every public state. On mismatch: stop animation, replace with latest snapshot. Keep event log long enough for disputes.

## 04 — Acceptance checklist (DoD for #1 + rooms)

- [ ] Roll 6 releases yard token; non-6 cannot  
- [ ] Released token lands on **start cell**, not +6 steps  
- [ ] Tokens advance **clockwise** on shared track (all four colors)  
- [ ] Exact roll required for home; overshoot not selectable  
- [ ] Landing captures on normal cells; safe cells prevent capture  
- [ ] Passing over never captures  
- [ ] Friendly tokens can share; no blockade  
- [ ] Capture or home grants exactly one bonus roll  
- [ ] Dual bonus triggers still grant only one roll  
- [ ] Three consecutive 6s: third ignored, turn ends  
- [ ] Client never invents die / never moves without committed roll  
- [ ] Legal highlights only after committed roll  

Free Play (#1) must pass the board/direction/legal subset on Expo Go before rooms. Full multiplayer checklist applies when match service ships.

import {
  MatchCommand,
  MatchEvent,
  MatchSnapshot,
  RULE_PROFILE,
} from "./types";

/**
 * In-host authoritative match stub (CLOCK IN cut).
 * Real deploy splits this to a game API; WebView never owns dice/truth.
 */
export class MatchService {
  private matches = new Map<string, MatchSnapshot>();

  create(matchId = `m-${Date.now().toString(36)}`): MatchSnapshot {
    const snap: MatchSnapshot = {
      matchId,
      phase: "lobby",
      turnSeat: 0,
      die: null,
      sixStreak: 0,
      seats: 0,
      pieces: [],
      events: [
        {
          type: "match.created",
          matchId,
          profileId: RULE_PROFILE.profileId,
        },
      ],
      winnerSeat: null,
    };
    this.matches.set(matchId, snap);
    return this.clone(snap);
  }

  get(matchId: string): MatchSnapshot | null {
    const m = this.matches.get(matchId);
    return m ? this.clone(m) : null;
  }

  command(matchId: string, cmd: MatchCommand): MatchSnapshot {
    const m = this.matches.get(matchId);
    if (!m) throw new Error("match_not_found");
    if (m.phase === "completed") throw new Error("match_completed");

    const push = (ev: MatchEvent) => m.events.push(ev);

    switch (cmd.type) {
      case "join": {
        if (m.seats >= 4) throw new Error("room_full");
        const seat = m.seats;
        m.seats += 1;
        m.pieces.push([-1, -1, -1, -1]);
        push({ type: "seat.joined", seat });
        break;
      }
      case "ready": {
        if (m.seats < 1) throw new Error("need_seat");
        // Solo stub: start with whoever joined (bot later).
        if (m.phase === "lobby") {
          m.phase = "turn";
          m.turnSeat = 0;
          push({ type: "match.started", turnSeat: 0 });
        }
        break;
      }
      case "roll": {
        if (m.phase !== "turn" && m.phase !== "rolled") {
          throw new Error("bad_phase");
        }
        if (m.phase === "rolled") throw new Error("already_rolled");
        const value = 1 + Math.floor(Math.random() * 6);
        m.die = value;
        m.phase = "rolled";
        m.sixStreak = value === 6 ? m.sixStreak + 1 : 0;
        if (m.sixStreak >= RULE_PROFILE.maxConsecutiveSixes) {
          const seat = m.turnSeat;
          push({ type: "die.rolled", seat, value, sixStreak: 3 });
          m.sixStreak = 0;
          m.die = null;
          m.phase = "turn";
          m.turnSeat = (seat + 1) % Math.max(m.seats, 1);
          push({ type: "turn.changed", turnSeat: m.turnSeat });
          break;
        }
        push({
          type: "die.rolled",
          seat: m.turnSeat,
          value,
          sixStreak: m.sixStreak,
        });
        break;
      }
      case "move": {
        if (m.phase !== "rolled" || m.die == null) throw new Error("roll_first");
        const seat = m.turnSeat;
        const pieces = m.pieces[seat];
        if (!pieces) throw new Error("no_pieces");
        const idx = cmd.pieceIndex;
        if (idx < 0 || idx > 3) throw new Error("bad_piece");
        let progress = pieces[idx];
        const die = m.die;

        if (progress < 0) {
          if (die !== RULE_PROFILE.enterRoll) throw new Error("need_six_to_enter");
          progress = 0;
        } else {
          const next = progress + die;
          if (RULE_PROFILE.exactFinish && next > 57) {
            throw new Error("exact_finish_required");
          }
          progress = Math.min(next, 57);
        }
        pieces[idx] = progress;
        push({ type: "piece.moved", seat, pieceIndex: idx, progress });

        const finished = pieces.every((p) => p >= 57);
        if (finished) {
          m.phase = "completed";
          m.winnerSeat = seat;
          push({
            type: "match.completed",
            winnerSeat: seat,
            reason: "all_home",
          });
          break;
        }

        const extra = die === 6 && RULE_PROFILE.extraTurnOnSix;
        m.die = null;
        if (extra) {
          m.phase = "turn";
        } else {
          m.phase = "turn";
          m.turnSeat = (m.turnSeat + 1) % Math.max(m.seats, 1);
          m.sixStreak = 0;
          push({ type: "turn.changed", turnSeat: m.turnSeat });
        }
        break;
      }
      case "forfeit": {
        m.phase = "completed";
        m.winnerSeat = (m.turnSeat + 1) % Math.max(m.seats, 1);
        push({
          type: "match.completed",
          winnerSeat: m.winnerSeat,
          reason: "forfeit",
        });
        break;
      }
      default:
        throw new Error("unknown_command");
    }

    return this.clone(m);
  }

  private clone(m: MatchSnapshot): MatchSnapshot {
    return JSON.parse(JSON.stringify(m)) as MatchSnapshot;
  }
}

/** Process-wide stub — swap for remote Game API later. */
export const matchService = new MatchService();

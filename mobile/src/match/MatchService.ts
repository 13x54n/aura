import {
  MatchCommand,
  MatchEvent,
  MatchSnapshot,
  LUDO_RULE_PROFILE,
  GameType,
} from "./types";

/**
 * In-host authoritative match stub (CLOCK IN cut).
 * Real deploy splits this to a game API; WebView never owns dice/truth.
 * Now supports multiple game types through gameType parameter.
 */
export class MatchService {
  private matches = new Map<string, MatchSnapshot>();

  create(matchId = `m-${Date.now().toString(36)}`, gameType: GameType = "ludo"): MatchSnapshot {
    const snap: MatchSnapshot = {
      matchId,
      gameType,
      phase: "lobby",
      turnSeat: 0,
      seats: 0,
      events: [
        {
          type: "match.created",
          matchId,
          profileId: gameType === "ludo" ? LUDO_RULE_PROFILE.profileId : `${gameType}-v1`,
          gameType,
        },
      ],
      winnerSeat: null,
      gameState: gameType === "ludo" ? {
        die: null,
        sixStreak: 0,
        pieces: [],
      } : {},
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
    const gameState = m.gameState || {};

    switch (cmd.type) {
      case "join": {
        if (m.seats >= 4) throw new Error("room_full");
        const seat = m.seats;
        m.seats += 1;
        if (m.gameType === "ludo") {
          if (!gameState.pieces) gameState.pieces = [];
          gameState.pieces.push([-1, -1, -1, -1]);
        }
        push({ type: "seat.joined", seat });
        break;
      }
      case "ready": {
        if (m.seats < 1) throw new Error("need_seat");
        if (m.phase === "lobby") {
          m.phase = "turn";
          m.turnSeat = 0;
          push({ type: "match.started", turnSeat: 0 });
        }
        break;
      }
      case "roll": {
        if (m.gameType === "ludo") {
          if (m.phase !== "turn" && m.phase !== "rolled") {
            throw new Error("bad_phase");
          }
          if (m.phase === "rolled") throw new Error("already_rolled");
          const value = 1 + Math.floor(Math.random() * 6);
          gameState.die = value;
          m.phase = "rolled";
          gameState.sixStreak = value === 6 ? (gameState.sixStreak || 0) + 1 : 0;
          if (gameState.sixStreak >= LUDO_RULE_PROFILE.maxConsecutiveSixes) {
            const seat = m.turnSeat;
            push({ type: "die.rolled", seat, value, sixStreak: 3 });
            gameState.sixStreak = 0;
            gameState.die = null;
            m.phase = "turn";
            m.turnSeat = (seat + 1) % Math.max(m.seats, 1);
            push({ type: "turn.changed", turnSeat: m.turnSeat });
            break;
          }
          push({
            type: "die.rolled",
            seat: m.turnSeat,
            value,
            sixStreak: gameState.sixStreak,
          });
        }
        break;
      }
      case "move": {
        if (m.gameType === "ludo" && cmd.pieceIndex !== undefined) {
          if (m.phase !== "rolled" || gameState.die == null) throw new Error("roll_first");
          const seat = m.turnSeat;
          const pieces = gameState.pieces?.[seat];
          if (!pieces) throw new Error("no_pieces");
          const idx = cmd.pieceIndex;
          if (idx < 0 || idx > 3) throw new Error("bad_piece");
          let progress = pieces[idx];
          const die = gameState.die;

          if (progress < 0) {
            if (die !== LUDO_RULE_PROFILE.enterRoll) throw new Error("need_six_to_enter");
            progress = 0;
          } else {
            const next = progress + die;
            if (LUDO_RULE_PROFILE.exactFinish && next > 57) {
              throw new Error("exact_finish_required");
            }
            progress = Math.min(next, 57);
          }
          pieces[idx] = progress;
          push({ type: "piece.moved", seat, pieceIndex: idx, progress });

          const finished = pieces.every((p: number) => p >= 57);
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

          const extra = die === 6 && LUDO_RULE_PROFILE.extraTurnOnSix;
          gameState.die = null;
          if (extra) {
            m.phase = "turn";
          } else {
            m.phase = "turn";
            m.turnSeat = (m.turnSeat + 1) % Math.max(m.seats, 1);
            gameState.sixStreak = 0;
            push({ type: "turn.changed", turnSeat: m.turnSeat });
          }
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

    m.gameState = gameState;
    return this.clone(m);
  }

  private clone(m: MatchSnapshot): MatchSnapshot {
    return JSON.parse(JSON.stringify(m)) as MatchSnapshot;
  }
}

/** Process-wide stub — swap for remote Game API later. */
export const matchService = new MatchService();

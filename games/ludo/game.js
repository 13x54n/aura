/** Aura Ludo Free Play — playable canvas board.
 *  Board paint adapted from AmitThakur/ludo (MIT). Piece rules: Aura.
 */
(function () {
  "use strict";

  var boardCanvas = document.getElementById("board-canvas");
  var ctx = boardCanvas.getContext("2d");
  var statusEl = document.getElementById("status");
  var closeBtn = document.getElementById("closeBtn");
  var muteBtn = document.getElementById("muteBtn");
  var seatEls = Array.prototype.slice.call(document.querySelectorAll(".seat"));
  var seatById = {};
  seatEls.forEach(function (el) {
    var id = Number(el.getAttribute("data-seat"));
    seatById[id] = {
      el: el,
      dice: el.querySelector(".seat-dice"),
      dieBtn: el.querySelector(".seat-die-btn"),
      dctx: el.querySelector(".seat-dice").getContext("2d"),
      dieTimer: el.querySelector(".die-timer"),
    };
  });
  var DICE_SIZE = 40;

  /** Short WebAudio SFX — no asset pack required in Expo Go. */
  var juice = {
    muted: false,
    ctx: null,
    moving: false,
    animPiece: null, // { seat, idx, x, y }
  };

  function ensureAudio() {
    if (juice.muted) return null;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!juice.ctx) juice.ctx = new AC();
      if (juice.ctx.state === "suspended") juice.ctx.resume();
      return juice.ctx;
    } catch (e) {
      return null;
    }
  }

  function beep(freq, dur, type, gain) {
    var ctx = ensureAudio();
    if (!ctx) return;
    var t0 = ctx.currentTime;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain == null ? 0.045 : gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function sfxRollTick() {
    beep(180 + Math.random() * 220, 0.035, "triangle", 0.03);
  }
  function sfxRollSettle() {
    beep(420, 0.07, "square", 0.05);
    setTimeout(function () { beep(560, 0.06, "square", 0.04); }, 40);
  }
  function sfxStep() {
    beep(260, 0.04, "sine", 0.035);
  }
  function sfxLand() {
    beep(320, 0.08, "sine", 0.05);
    setTimeout(function () { beep(240, 0.09, "triangle", 0.04); }, 50);
  }
  function sfxCapture() {
    beep(160, 0.1, "sawtooth", 0.055);
    setTimeout(function () { beep(110, 0.12, "sawtooth", 0.045); }, 70);
  }

  function setMuted(on) {
    juice.muted = !!on;
    try {
      localStorage.setItem("aura.ludo.mute", juice.muted ? "1" : "0");
    } catch (e) {}
    if (muteBtn) {
      muteBtn.textContent = juice.muted ? "Sound off" : "Sound on";
      muteBtn.setAttribute("aria-pressed", juice.muted ? "true" : "false");
    }
  }
  try {
    if (localStorage.getItem("aura.ludo.mute") === "1") juice.muted = true;
  } catch (e) {}


  var CELL = 25;
  var HOME = 150;
  var COLORS = ["#2563EB", "#EAB308", "#16A34A", "#DC2626"];
  var NAMES = ["Blue", "Yellow", "Green", "Red"];
  var HUMAN = 3;
  /** Screen / board clockwise after VIEW_ROT: BL→TL→TR→BR = Red→Green→Blue→Yellow. */
  var NEXT_CW = { 3: 2, 2: 0, 0: 1, 1: 3 };
  var ENTER = 6;
  var TRACK = 52;
  var FINISH = 57; // TRACK + 5 (home stretch 0..5 → progress TRACK..FINISH)

  /** 52-cell main track, clockwise from Red entry (BR).
   *  Prior build walked the opposite way; Red must go left along the bottom
   *  toward Green, not up into Yellow's corridor (#1).
   */
  var PATH = (function () {
    var pts = [];
    function add(c, r) {
      pts.push([c * CELL + CELL / 2, r * CELL + CELL / 2]);
    }
    var r, c;
    // Build the old ring, then reverse so progress walks clockwise.
    for (r = 13; r >= 9; r--) add(8, r);
    for (c = 9; c <= 14; c++) add(c, 8);
    for (r = 7; r >= 6; r--) add(14, r);
    for (c = 13; c >= 9; c--) add(c, 6);
    for (r = 5; r >= 0; r--) add(8, r);
    for (c = 7; c >= 6; c--) add(c, 0);
    for (r = 1; r <= 5; r++) add(6, r);
    for (c = 5; c >= 0; c--) add(c, 6);
    for (r = 7; r <= 8; r++) add(0, r);
    for (c = 1; c <= 5; c++) add(c, 8);
    for (r = 9; r <= 14; r++) add(6, r);
    add(7, 14);
    add(8, 14);
    // Reverse ring (clockwise). Red painted start is PATH[43]=(13,8), not index 0.
    var out = [pts[0]];
    for (var i = pts.length - 1; i >= 1; i--) out.push(pts[i]);
    return out;
  })();

  function cellCenters(list) {
    return list.map(function (p) {
      return [p[0] * CELL + CELL / 2, p[1] * CELL + CELL / 2];
    });
  }

  // Home corridors into center: Blue←left, Yellow←top, Green←bottom, Red←right
  var HOME_PATH = [
    cellCenters([[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]]), // blue TL
    cellCenters([[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]]), // yellow TR
    cellCenters([[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]]), // green BL
    cellCenters([[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]]), // red BR
  ];

  var START = [17, 30, 4, 43]; // blue yellow green red — painted start cells (13 apart)

  var SAFE = {};
  // Painted stars + each color's start cell (Rule Book: safe cells cannot be captured)
  [12, 25, 38, 51].forEach(function (i) {
    SAFE[i] = 1;
  });
  START.forEach(function (s) {
    SAFE[s] = 1;
  });

  var YARD = [
    [[50, 50], [100, 50], [50, 100], [100, 100]],
    [[275, 50], [325, 50], [275, 100], [325, 100]],
    [[50, 275], [100, 275], [50, 325], [100, 325]],
    [[275, 275], [325, 275], [275, 325], [325, 325]],
  ];

  /** Screen rotation so HUMAN house is bottom-left (Rule Book / Lex).
   *  Seat→CCW quarters from painted layout: Blue0 Yellow1 Green2 Red3→BL.
   *  Red human = 3 quarters. Rules/PATH stay absolute — view only.
   */
  // Lex shot: 90° left Red at TR. Need 270° CCW (3) so Red BR → screen BL.
  var VIEW_ROT = 3; // quarter-turns CCW
  var CX = 375 / 2;
  var CY = 375 / 2;

  // Canvas y-down: ctx.rotate(-PI/2) maps paint (rx,ry) → (ry,-rx) (= 90° CCW on screen).
  // toScreen must match that; fromScreen is the inverse for hit-testing.
  function toScreen(x, y) {
    var rx = x - CX;
    var ry = y - CY;
    for (var i = 0; i < VIEW_ROT; i++) {
      var nx = ry;
      var ny = -rx;
      rx = nx;
      ry = ny;
    }
    return [CX + rx, CY + ry];
  }

  function fromScreen(x, y) {
    var rx = x - CX;
    var ry = y - CY;
    for (var i = 0; i < VIEW_ROT; i++) {
      // inverse of canvas -90°: (rx,ry) → (-ry, rx)
      var nx = -ry;
      var ny = rx;
      rx = nx;
      ry = ny;
    }
    return [CX + rx, CY + ry];
  }

  var state = {
    pieces: [
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
    ],
    turn: HUMAN,
    die: null,
    phase: "roll",
    winner: null,
    sixStreak: 0,
    highlight: [],
    rolling: false,
  };

  /** Soft turn clock for dock chrome (ref layer 1). Free Play: visual only, no forfeit. */
  var TURN_SECS = 20;
  var turnTimer = { left: TURN_SECS, handle: null };

  function stopTurnTimer() {
    if (turnTimer.handle) {
      clearInterval(turnTimer.handle);
      turnTimer.handle = null;
    }
  }

  function paintTimers() {
    Object.keys(seatById).forEach(function (k) {
      var id = Number(k);
      var box = seatById[id];
      if (!box || !box.dieTimer) return;
      var show =
        state.winner == null &&
        id === state.turn &&
        turnTimer.left <= 10;
      if (!show) {
        box.dieTimer.hidden = true;
        box.dieTimer.textContent = "";
        return;
      }
      box.dieTimer.hidden = false;
      box.dieTimer.textContent = String(turnTimer.left) + "s";
    });
  }

  function startTurnTimer() {
    stopTurnTimer();
    turnTimer.left = TURN_SECS;
    paintTimers();
    turnTimer.handle = setInterval(function () {
      if (state.winner != null) {
        stopTurnTimer();
        return;
      }
      turnTimer.left = Math.max(0, turnTimer.left - 1);
      paintTimers();
      // Free Play: hold at 0 — rooms will enforce later
    }, 1000);
  }

  function setStatus(t) {
    statusEl.textContent = t;
  }

  function paintBoard() {
    var homeSize = HOME;
    var pathSize = CELL;
    var homeCircleSize = pathSize / 2;
    var colors = COLORS;
    var i, j, topLeftHomeCircleX, topLeftHomeCircleY;

    ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
    ctx.fillStyle = "#F8FAFC";
    ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#0f172a";

    function homeBlock(colorIdx, x, y) {
      ctx.fillStyle = colors[colorIdx];
      ctx.fillRect(x, y, homeSize, homeSize);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(x + pathSize, y + pathSize, homeSize - 2 * pathSize, homeSize - 2 * pathSize);
      ctx.fillStyle = colors[colorIdx];
      topLeftHomeCircleX = x + 2 * pathSize;
      topLeftHomeCircleY = y + 2 * pathSize;
      for (i = 0; i < 2; i++) {
        for (j = 0; j < 2; j++) {
          ctx.beginPath();
          ctx.arc(
            topLeftHomeCircleX + i * 2 * pathSize,
            topLeftHomeCircleY + j * 2 * pathSize,
            homeCircleSize,
            0,
            2 * Math.PI
          );
          ctx.fill();
        }
      }
    }

    homeBlock(0, 0, 0);
    homeBlock(1, boardCanvas.width - homeSize, 0);
    homeBlock(2, 0, boardCanvas.height - homeSize);
    homeBlock(3, boardCanvas.width - homeSize, boardCanvas.height - homeSize);

    // colored runways + triangles (Amit layout)
    ctx.fillStyle = colors[0];
    ctx.fillRect(pathSize, homeSize, pathSize, pathSize);
    ctx.fillRect(pathSize, homeSize + pathSize, 5 * pathSize, pathSize);
    ctx.beginPath();
    ctx.moveTo(homeSize, homeSize);
    ctx.lineTo(boardCanvas.width / 2, boardCanvas.height / 2);
    ctx.lineTo(homeSize, homeSize + 3 * pathSize);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = colors[1];
    ctx.fillRect(boardCanvas.width - homeSize - pathSize, pathSize, pathSize, pathSize);
    ctx.fillRect(homeSize + pathSize, pathSize, pathSize, 5 * pathSize);
    ctx.beginPath();
    ctx.moveTo(homeSize, homeSize);
    ctx.lineTo(boardCanvas.width / 2, boardCanvas.height / 2);
    ctx.lineTo(boardCanvas.width - homeSize, homeSize);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = colors[2];
    ctx.fillRect(homeSize, boardCanvas.height - 2 * pathSize, pathSize, pathSize);
    ctx.fillRect(homeSize + pathSize, homeSize + 3 * pathSize, pathSize, 5 * pathSize);
    ctx.beginPath();
    ctx.moveTo(homeSize, homeSize + 3 * pathSize);
    ctx.lineTo(boardCanvas.width / 2, boardCanvas.height / 2);
    ctx.lineTo(homeSize, boardCanvas.height - homeSize);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = colors[3];
    ctx.fillRect(boardCanvas.width - 2 * pathSize, homeSize + 2 * pathSize, pathSize, pathSize);
    ctx.fillRect(boardCanvas.width - homeSize, homeSize + pathSize, 5 * pathSize, pathSize);
    ctx.beginPath();
    ctx.moveTo(boardCanvas.width - homeSize, homeSize);
    ctx.lineTo(boardCanvas.width / 2, boardCanvas.height / 2);
    ctx.lineTo(boardCanvas.width - homeSize, homeSize + 3 * pathSize);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#334155";
    for (i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(homeSize + i * pathSize, 0);
      ctx.lineTo(homeSize + i * pathSize, homeSize);
      ctx.stroke();
    }
    for (i = 1; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(homeSize, i * pathSize);
      ctx.lineTo(homeSize + 3 * pathSize, i * pathSize);
      ctx.stroke();
    }
    for (i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(boardCanvas.width - homeSize, homeSize + i * pathSize);
      ctx.lineTo(boardCanvas.width, homeSize + i * pathSize);
      ctx.stroke();
    }
    for (i = 1; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(boardCanvas.width - i * pathSize, homeSize);
      ctx.lineTo(boardCanvas.width - i * pathSize, homeSize + 3 * pathSize);
      ctx.stroke();
    }
    for (i = 0; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(homeSize + i * pathSize, boardCanvas.height - homeSize);
      ctx.lineTo(homeSize + i * pathSize, boardCanvas.height);
      ctx.stroke();
    }
    for (i = 1; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(homeSize, boardCanvas.height - homeSize + i * pathSize);
      ctx.lineTo(homeSize + 3 * pathSize, boardCanvas.height - homeSize + i * pathSize);
      ctx.stroke();
    }
    for (i = 0; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(0, homeSize + i * pathSize);
      ctx.lineTo(homeSize, homeSize + i * pathSize);
      ctx.stroke();
    }
    for (i = 1; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(i * pathSize, homeSize);
      ctx.lineTo(i * pathSize, homeSize + 3 * pathSize);
      ctx.stroke();
    }

    drawStar(homeSize + pathSize / 2, 2 * pathSize + pathSize / 2);
    drawStar(boardCanvas.width - 2.5 * pathSize, homeSize + pathSize / 2);
    drawStar(homeSize + 2.5 * pathSize, boardCanvas.height - 2.5 * pathSize);
    drawStar(2 * pathSize + pathSize / 2, homeSize + 2.5 * pathSize);
  }

  function drawStar(x, y) {
    var r = 8;
    ctx.fillStyle = "#64748B";
    ctx.beginPath();
    for (var i = 0; i < 5; i++) {
      var a = ((i * 72 - 90) * Math.PI) / 180;
      var b = (((i * 72 - 90) + 36) * Math.PI) / 180;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(b) * (r / 2.4), y + Math.sin(b) * (r / 2.4));
    }
    ctx.closePath();
    ctx.fill();
  }

  function piecePos(seat, idx) {
    var p = state.pieces[seat][idx];
    if (p < 0) return YARD[seat][idx];
    if (p >= TRACK) {
      return HOME_PATH[seat][Math.min(p - TRACK, 5)];
    }
    return PATH[(START[seat] + p) % TRACK];
  }

  function absCell(seat, progress) {
    if (progress < 0 || progress >= TRACK) return null;
    return (START[seat] + progress) % TRACK;
  }

  function drawPieces() {
    for (var seat = 0; seat < 4; seat++) {
      for (var idx = 0; idx < 4; idx++) {
        var pos = piecePos(seat, idx);
        if (
          juice.animPiece &&
          juice.animPiece.seat === seat &&
          juice.animPiece.idx === idx
        ) {
          pos = [juice.animPiece.x, juice.animPiece.y];
        }
        var hl = state.highlight.some(function (h) {
          return h.seat === seat && h.idx === idx;
        });
        ctx.beginPath();
        ctx.arc(pos[0], pos[1], hl ? 11 : 9, 0, 2 * Math.PI);
        ctx.fillStyle = COLORS[seat];
        ctx.fill();
        ctx.lineWidth = hl ? 3 : 1.5;
        ctx.strokeStyle = hl ? "#ffffff" : "rgba(0,0,0,0.45)";
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 10px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(idx + 1), pos[0], pos[1] + 0.5);
      }
    }
  }

  function drawDiceFace(n, seat) {
    var target = seat != null ? seat : state.turn;
    var box = seatById[target];
    if (!box) return;
    var dctx = box.dctx;
    var s = DICE_SIZE;
    var m = s / 56;
    dctx.clearRect(0, 0, s, s);
    dctx.fillStyle = "#fff";
    dctx.fillRect(0, 0, s, s);
    dctx.strokeStyle = "#cbd5e1";
    dctx.strokeRect(0.5, 0.5, s - 1, s - 1);
    var dots = {
      1: [[28, 28]],
      2: [[16, 16], [40, 40]],
      3: [[16, 16], [28, 28], [40, 40]],
      4: [[16, 16], [40, 16], [16, 40], [40, 40]],
      5: [[16, 16], [40, 16], [28, 28], [16, 40], [40, 40]],
      6: [[16, 16], [40, 16], [16, 28], [40, 28], [16, 40], [40, 40]],
    };
    dctx.fillStyle = "#0f172a";
    (dots[n] || []).forEach(function (d) {
      dctx.beginPath();
      dctx.arc(d[0] * m, d[1] * m, 4.5 * m, 0, 2 * Math.PI);
      dctx.fill();
    });
  }

  function clearOtherDice(exceptSeat) {
    Object.keys(seatById).forEach(function (k) {
      var id = Number(k);
      if (id === exceptSeat) return;
      drawDiceFace(1, id);
    });
  }

  function render() {
    ctx.save();
    ctx.translate(CX, CY);
    for (var i = 0; i < VIEW_ROT; i++) ctx.rotate(-Math.PI / 2);
    ctx.translate(-CX, -CY);
    paintBoard();
    drawPieces();
    ctx.restore();
    if (state.die) drawDiceFace(state.die, state.turn);
  }

  function legalMoves(seat, die) {
    var moves = [];
    for (var idx = 0; idx < 4; idx++) {
      var p = state.pieces[seat][idx];
      if (p < 0) {
        if (die === ENTER) moves.push({ seat: seat, idx: idx, to: 0 });
        continue;
      }
      if (p >= FINISH) continue;
      var next = p + die;
      if (next > FINISH) continue;
      moves.push({ seat: seat, idx: idx, to: next });
    }
    return moves;
  }

  function applyCapture(seat, progress) {
    var captured = 0;
    if (progress < 0 || progress >= TRACK) return 0;
    var abs = absCell(seat, progress);
    if (SAFE[abs]) return 0;
    for (var o = 0; o < 4; o++) {
      if (o === seat) continue;
      for (var i = 0; i < 4; i++) {
        var op = state.pieces[o][i];
        if (op < 0 || op >= TRACK) continue;
        if (absCell(o, op) === abs) {
          state.pieces[o][i] = -1;
          captured++;
        }
      }
    }
    return captured;
  }

  function checkWin(seat) {
    return state.pieces[seat].every(function (p) {
      return p >= FINISH;
    });
  }

  function updateTurnBanner() {
    seatEls.forEach(function (el) {
      var id = Number(el.getAttribute("data-seat"));
      var active = state.winner == null && id === state.turn;
      el.classList.toggle("active", active);
      var box = seatById[id];
      if (!box) return;
      if (state.winner != null) {
        box.dieBtn.disabled = true;
        return;
      }
      // Human only: tap the die to roll on their seat during roll phase.
      // Bots auto-roll; die stays non-interactive.
      box.dieBtn.disabled = !(
        id === HUMAN &&
        id === state.turn &&
        state.phase === "roll" &&
        !state.rolling &&
        !juice.moving
      );
    });
    if (state.winner != null) {
      setStatus(NAMES[state.winner] + " wins · Free Play");
      return;
    }
    if (state.turn === HUMAN) {
      setStatus(state.phase === "move" ? "Tap a highlighted piece" : "Your turn · tap the die");
    } else {
      setStatus(NAMES[state.turn] + " · rolling from their corner");
    }
    paintTimers();
  }

  function endTurn(extra) {
    state.die = null;
    state.highlight = [];
    state.phase = "roll";
    state.rolling = false;
    if (!extra) {
      // Non-bonus end: pass turn. Streak clears on pass (and on non-6 in afterRoll).
      state.sixStreak = 0;
      state.turn = NEXT_CW[state.turn];
    }
    startTurnTimer();
    updateTurnBanner();
    render();
    if (state.turn !== HUMAN && state.winner == null) {
      setTimeout(botTurn, 480);
    }
  }

  function progressPos(seat, progress) {
    if (progress < 0) return null;
    if (progress >= TRACK) {
      return HOME_PATH[seat][Math.min(progress - TRACK, 5)];
    }
    return PATH[(START[seat] + progress) % TRACK];
  }

  function finishMove(move, fromYard, captured, homed) {
    juice.animPiece = null;
    juice.moving = false;
    if (captured > 0) sfxCapture();
    else sfxLand();
    if (fromYard && move.to === 0) {
      setStatus(NAMES[move.seat] + " · yard → start cell");
    }
    render();
    if (checkWin(move.seat)) {
      state.winner = move.seat;
      state.phase = "done";
      state.highlight = [];
      updateTurnBanner();
      return;
    }
    // Rule Book: one bonus roll after 6, capture, or home (not stacked)
    var extra = state.die === 6 || captured > 0 || homed;
    endTurn(extra);
  }

  function animateMove(move, from, to, fromYard) {
    juice.moving = true;
    state.highlight = [];
    state.phase = "anim";
    updateTurnBanner();

    var steps = [];
    if (from < 0) {
      // Yard → start: one hop
      steps.push(0);
    } else {
      for (var p = from + 1; p <= to; p++) steps.push(p);
    }
    if (!steps.length) steps.push(to);

    var i = 0;
    function tick() {
      var prog = steps[i];
      state.pieces[move.seat][move.idx] = prog;
      var pos = progressPos(move.seat, prog);
      if (from < 0 && i === 0) {
        // start from yard visual
        var yp = YARD[move.seat][move.idx];
        juice.animPiece = { seat: move.seat, idx: move.idx, x: yp[0], y: yp[1] };
        render();
        // then slide toward start on next frame batch
      }
      juice.animPiece = {
        seat: move.seat,
        idx: move.idx,
        x: pos[0],
        y: pos[1],
      };
      sfxStep();
      render();
      i++;
      if (i < steps.length) {
        setTimeout(tick, 90);
      } else {
        state.pieces[move.seat][move.idx] = to;
        var captured = 0;
        if (to < TRACK) captured = applyCapture(move.seat, to);
        var homed = to >= FINISH;
        finishMove(move, fromYard, captured, homed);
      }
    }
    tick();
  }

  function doMove(move) {
    if (juice.moving) return;
    var seat = move.seat;
    var from = state.pieces[seat][move.idx];
    var fromYard = from < 0;
    animateMove(move, from, move.to, fromYard);
  }

  function afterRoll(value) {
    state.die = value;
    state.rolling = false;
    drawDiceFace(value, state.turn);
    if (value === 6) state.sixStreak += 1;
    else state.sixStreak = 0;
    if (state.sixStreak >= 3) {
      setStatus("Three sixes — turn forfeited");
      state.sixStreak = 0;
      setTimeout(function () {
        endTurn(false);
      }, 650);
      return;
    }
    var moves = legalMoves(state.turn, value);
    if (!moves.length) {
      setStatus("No legal move");
      setTimeout(function () {
        endTurn(value === 6);
      }, 550);
      return;
    }
    state.phase = "move";
    state.highlight = moves;
    updateTurnBanner();
    render();
    if (state.turn !== HUMAN) {
      setTimeout(function () {
        doMove(moves[Math.floor(Math.random() * moves.length)]);
      }, 380);
    } else if (moves.length === 1 && moves[0].to === 0) {
      // Rule Book: 6 from yard → start cell. Auto-apply sole entry so it never looks stuck in yard.
      setStatus("6 · out to your start");
      setTimeout(function () {
        doMove(moves[0]);
      }, 280);
    }
  }

  function rollTheDice(who) {
    if (state.phase !== "roll" || state.winner != null || state.rolling || juice.moving) return;
    if (state.turn !== HUMAN && who !== "bot") return;
    state.rolling = true;
    updateTurnBanner();
    clearOtherDice(state.turn);
    var seat = state.turn;
    var box = seatById[seat];
    if (box && box.dieBtn) box.dieBtn.classList.add("die-rolling");
    ensureAudio();
    // ~320ms rattle (8×40ms) then snap — UX band 280–400ms
    var ticks = 0;
    var iv = setInterval(function () {
      drawDiceFace(1 + Math.floor(Math.random() * 6), seat);
      sfxRollTick();
      ticks++;
      if (ticks >= 8) {
        clearInterval(iv);
        if (box && box.dieBtn) box.dieBtn.classList.remove("die-rolling");
        sfxRollSettle();
        afterRoll(1 + Math.floor(Math.random() * 6));
      }
    }, 40);
  }

  function botTurn() {
    if (state.winner != null || state.turn === HUMAN) return;
    rollTheDice("bot");
  }

  function canvasCoords(ev) {
    var rect = boardCanvas.getBoundingClientRect();
    var tch = ev.changedTouches ? ev.changedTouches[0] : ev.touches ? ev.touches[0] : ev;
    var x = ((tch.clientX - rect.left) / rect.width) * boardCanvas.width;
    var y = ((tch.clientY - rect.top) / rect.height) * boardCanvas.height;
    return fromScreen(x, y);
  }

  function onBoardPointer(ev) {
    if (state.phase !== "move" || state.turn !== HUMAN || juice.moving) return;
    ev.preventDefault();
    var pt = canvasCoords(ev);
    for (var i = 0; i < state.highlight.length; i++) {
      var m = state.highlight[i];
      var pos = piecePos(m.seat, m.idx);
      var dx = pos[0] - pt[0];
      var dy = pos[1] - pt[1];
      var rad = state.pieces[m.seat][m.idx] < 0 ? 28 : 20;
      if (dx * dx + dy * dy <= rad * rad) {
        doMove(m);
        return;
      }
    }
  }

  seatEls.forEach(function (el) {
    var id = Number(el.getAttribute("data-seat"));
    var box = seatById[id];
    box.dieBtn.addEventListener("click", function () {
      if (id !== HUMAN || state.turn !== HUMAN) return;
      rollTheDice();
    });
  });
  if (muteBtn) {
    setMuted(juice.muted);
    muteBtn.addEventListener("click", function () {
      setMuted(!juice.muted);
      ensureAudio();
    });
  }
  closeBtn.addEventListener("click", function () {
    if (window.AuraHost && window.AuraHost.close) window.AuraHost.close();
  });
  boardCanvas.addEventListener("click", onBoardPointer);
  boardCanvas.addEventListener("touchend", onBoardPointer, { passive: false });

  (function hostReady() {
    var n = 0;
    var t = setInterval(function () {
      n++;
      if (window.AuraHost) {
        clearInterval(t);
        try {
          if (window.AuraHost.handshake) window.AuraHost.handshake();
          if (window.AuraHost.ready) window.AuraHost.ready();
        } catch (e) {}
      } else if (n > 50) clearInterval(t);
    }, 40);
  })();

  [0, 1, 2, 3].forEach(function (s) {
    drawDiceFace(1, s);
  });
  startTurnTimer();
  render();
  updateTurnBanner();
})();

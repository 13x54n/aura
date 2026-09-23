/** Aura Ludo Free Play — playable canvas board.
 *  Board paint adapted from AmitThakur/ludo (MIT). Piece rules: Aura.
 */
(function () {
  "use strict";

  var boardCanvas = document.getElementById("board-canvas");
  var ctx = boardCanvas.getContext("2d");
  var diceCanvas = document.getElementById("dice-canvas");
  var dctx = diceCanvas.getContext("2d");
  var statusEl = document.getElementById("status");
  var rollBtn = document.getElementById("rollBtn");
  var closeBtn = document.getElementById("closeBtn");

  var CELL = 25;
  var HOME = 150;
  var COLORS = ["#2563EB", "#EAB308", "#16A34A", "#DC2626"];
  var NAMES = ["Blue", "Yellow", "Green", "Red"];
  var HUMAN = 3;
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
    // Reverse ring keeping index 0 on Red's entry cell (8,13).
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

  var START = [15, 28, 3, 0]; // blue yellow green red — remapped after clockwise reverse

  var SAFE = {};
  // Stars + each color's start cell (Rule Book: safe cells cannot be captured)
  [0, 8, 13, 21, 26, 34, 39, 47].forEach(function (i) {
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
   *  1 = 90° CCW: board BR (Red) → screen BL. Rules/PATH stay absolute.
   */
  var VIEW_ROT = 1; // quarter-turns CCW
  var CX = 375 / 2;
  var CY = 375 / 2;

  function toScreen(x, y) {
    var rx = x - CX;
    var ry = y - CY;
    for (var i = 0; i < VIEW_ROT; i++) {
      var nx = -ry;
      var ny = rx;
      rx = nx;
      ry = ny;
    }
    return [CX + rx, CY + ry];
  }

  function fromScreen(x, y) {
    var rx = x - CX;
    var ry = y - CY;
    for (var i = 0; i < VIEW_ROT; i++) {
      // inverse of 90° CCW = 90° CW
      var nx = ry;
      var ny = -rx;
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

  function drawDiceFace(n) {
    dctx.clearRect(0, 0, 56, 56);
    dctx.fillStyle = "#fff";
    dctx.fillRect(0, 0, 56, 56);
    dctx.strokeStyle = "#cbd5e1";
    dctx.strokeRect(0.5, 0.5, 55, 55);
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
      dctx.arc(d[0], d[1], 4.5, 0, 2 * Math.PI);
      dctx.fill();
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
    if (state.die) drawDiceFace(state.die);
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
    if (state.winner != null) {
      setStatus(NAMES[state.winner] + " wins · Free Play");
      rollBtn.disabled = true;
      return;
    }
    if (state.turn === HUMAN) {
      setStatus(state.phase === "move" ? "Tap a highlighted piece (your house = bottom-left)" : "Your turn · house bottom-left · Roll");
      rollBtn.disabled = state.phase !== "roll" || state.rolling;
    } else {
      setStatus(NAMES[state.turn] + " thinking…");
      rollBtn.disabled = true;
    }
  }

  function endTurn(extra) {
    state.die = null;
    state.highlight = [];
    state.phase = "roll";
    state.rolling = false;
    if (!extra) {
      // Non-bonus end: pass turn. Streak clears on pass (and on non-6 in afterRoll).
      state.sixStreak = 0;
      state.turn = (state.turn + 1) % 4;
    }
    updateTurnBanner();
    render();
    if (state.turn !== HUMAN && state.winner == null) {
      setTimeout(botTurn, 480);
    }
  }

  function doMove(move) {
    var seat = move.seat;
    var fromYard = state.pieces[seat][move.idx] < 0;
    state.pieces[seat][move.idx] = move.to;
    var captured = 0;
    if (move.to < TRACK) captured = applyCapture(seat, move.to);
    var homed = move.to >= FINISH;
    if (fromYard && move.to === 0) {
      setStatus(NAMES[seat] + " · yard → start cell");
    }
    render();
    if (checkWin(seat)) {
      state.winner = seat;
      state.phase = "done";
      state.highlight = [];
      updateTurnBanner();
      return;
    }
    // Rule Book: one bonus roll after 6, capture, or home (not stacked)
    var extra = state.die === 6 || captured > 0 || homed;
    endTurn(extra);
  }

  function afterRoll(value) {
    state.die = value;
    state.rolling = false;
    drawDiceFace(value);
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
    if (state.phase !== "roll" || state.winner != null || state.rolling) return;
    if (state.turn !== HUMAN && who !== "bot") return;
    state.rolling = true;
    rollBtn.disabled = true;
    var ticks = 0;
    var iv = setInterval(function () {
      drawDiceFace(1 + Math.floor(Math.random() * 6));
      ticks++;
      if (ticks > 10) {
        clearInterval(iv);
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
    if (state.phase !== "move" || state.turn !== HUMAN) return;
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

  rollBtn.addEventListener("click", function () {
    rollTheDice();
  });
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

  drawDiceFace(1);
  render();
  updateTurnBanner();
})();

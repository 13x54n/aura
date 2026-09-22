(function () {
  "use strict";
  var board = document.getElementById("board");
  var ctx = board.getContext("2d");
  var dice = document.getElementById("dice");
  var dctx = dice.getContext("2d");
  var statusEl = document.getElementById("status");
  var rollBtn = document.getElementById("rollBtn");

  var SNAKES = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };
  var LADDERS = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };
  var HUMAN = 0;
  var NAMES = ["You", "Bot"];
  var COLORS = ["#a855f7", "#22c55e"];

  var state = {
    pos: [0, 0],
    turn: HUMAN,
    die: null,
    winner: null,
    rolling: false,
  };

  function cellXY(n) {
    // 1..100, boustrophedon from bottom-left
    if (n < 1) return null;
    var idx = n - 1;
    var rowFromBottom = Math.floor(idx / 10);
    var col = idx % 10;
    if (rowFromBottom % 2 === 1) col = 9 - col;
    var row = 9 - rowFromBottom;
    var s = board.width / 10;
    return [col * s + s / 2, row * s + s / 2, s];
  }

  function drawDice(n) {
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
      dctx.arc(d[0], d[1], 4.5, 0, Math.PI * 2);
      dctx.fill();
    });
  }

  function drawBoard() {
    var s = board.width / 10;
    for (var r = 0; r < 10; r++) {
      for (var c = 0; c < 10; c++) {
        var rowFromBottom = 9 - r;
        var col = c;
        if (rowFromBottom % 2 === 1) col = 9 - c;
        var n = rowFromBottom * 10 + col + 1;
        ctx.fillStyle = (r + c) % 2 === 0 ? "#d1fae5" : "#ecfdf5";
        ctx.fillRect(c * s, r * s, s, s);
        ctx.fillStyle = "#065f46";
        ctx.font = "bold " + Math.floor(s * 0.28) + "px system-ui";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(String(n), c * s + 4, r * s + 3);
      }
    }
    // ladders
    Object.keys(LADDERS).forEach(function (k) {
      var a = cellXY(+k);
      var b = cellXY(LADDERS[k]);
      ctx.strokeStyle = "rgba(34,197,94,0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    });
    // snakes
    Object.keys(SNAKES).forEach(function (k) {
      var a = cellXY(+k);
      var b = cellXY(SNAKES[k]);
      ctx.strokeStyle = "rgba(239,68,68,0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    });
    // tokens
    for (var i = 0; i < 2; i++) {
      var p = state.pos[i];
      var xy = p === 0 ? [s * 0.35 + i * s * 0.35, board.height - s * 0.35] : cellXY(p);
      if (!xy) continue;
      ctx.beginPath();
      ctx.arc(xy[0] + (i === 1 ? 6 : -6), xy[1], s * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[i];
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function render() {
    ctx.clearRect(0, 0, board.width, board.height);
    drawBoard();
    if (state.die) drawDice(state.die);
    if (state.winner != null) {
      statusEl.textContent = NAMES[state.winner] + " wins · Free Play";
      rollBtn.disabled = true;
    } else if (state.turn === HUMAN) {
      statusEl.textContent = state.die
        ? ("You rolled " + state.die + " · square " + state.pos[HUMAN])
        : "Your turn (Purple) · Roll";
      rollBtn.disabled = state.rolling;
    } else {
      statusEl.textContent = state.die
        ? ("Bot rolled " + state.die + " · square " + state.pos[1])
        : "Bot thinking…";
      rollBtn.disabled = true;
    }
  }

  function applyTeleport(player) {
    var p = state.pos[player];
    if (LADDERS[p]) state.pos[player] = LADDERS[p];
    else if (SNAKES[p]) state.pos[player] = SNAKES[p];
  }

  function advance(player, die) {
    var cur = state.pos[player];
    var next = cur + die;
    if (next > 100) return false;
    state.pos[player] = next;
    applyTeleport(player);
    if (state.pos[player] === 100) state.winner = player;
    return true;
  }

  function endTurn() {
    state.rolling = false;
    state.die = null;
    if (state.winner != null) {
      render();
      return;
    }
    state.turn = 1 - state.turn;
    render();
    if (state.turn !== HUMAN) setTimeout(botTurn, 500);
  }

  function afterRoll(value) {
    state.die = value;
    drawDice(value);
    var moved = advance(state.turn, value);
    render();
    setTimeout(endTurn, moved ? 450 : 350);
  }

  function roll(who) {
    if (state.winner != null || state.rolling) return;
    if (state.turn !== HUMAN && who !== "bot") return;
    state.rolling = true;
    rollBtn.disabled = true;
    var ticks = 0;
    var iv = setInterval(function () {
      drawDice(1 + Math.floor(Math.random() * 6));
      ticks++;
      if (ticks > 10) {
        clearInterval(iv);
        afterRoll(1 + Math.floor(Math.random() * 6));
      }
    }, 40);
  }

  function botTurn() {
    if (state.winner != null || state.turn === HUMAN) return;
    roll("bot");
  }

  rollBtn.onclick = function () { roll(); };
  document.getElementById("closeBtn").onclick = function () {
    if (window.AuraHost && window.AuraHost.close) window.AuraHost.close();
  };
  (function hostReady() {
    var n = 0;
    var t = setInterval(function () {
      n++;
      if (window.AuraHost) {
        clearInterval(t);
        try {
          window.AuraHost.handshake && window.AuraHost.handshake();
          window.AuraHost.ready && window.AuraHost.ready();
        } catch (e) {}
      } else if (n > 50) clearInterval(t);
    }, 40);
  })();

  drawDice(1);
  render();
})();

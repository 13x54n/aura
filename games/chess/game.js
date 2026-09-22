(function () {
  "use strict";
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var statusEl = document.getElementById("status");
  var ChessCtor = window.Chess;
  if (!ChessCtor) {
    statusEl.textContent = "Chess engine missing";
    return;
  }
  var game = new ChessCtor();
  var selected = null;
  var legal = [];
  var last = null;
  var N = 8;
  var LIGHT = "#f0d9b5";
  var DARK = "#b58863";
  var HI = "rgba(139,92,246,0.45)";
  var LAST = "rgba(250,204,21,0.35)";
  var GLYPH = {
    wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
    bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
  };

  function sqSize() { return canvas.width / N; }

  function xyToSq(x, y) {
    var s = sqSize();
    var file = Math.floor(x / s);
    var rank = Math.floor(y / s);
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
    return "abcdefgh"[file] + (8 - rank);
  }

  function sqToXY(sq) {
    var file = "abcdefgh".indexOf(sq[0]);
    var rank = 8 - parseInt(sq[1], 10);
    var s = sqSize();
    return [file * s + s / 2, rank * s + s / 2];
  }

  function render() {
    var s = sqSize();
    var board = game.board();
    for (var r = 0; r < 8; r++) {
      for (var f = 0; f < 8; f++) {
        ctx.fillStyle = (r + f) % 2 === 0 ? LIGHT : DARK;
        ctx.fillRect(f * s, r * s, s, s);
      }
    }
    if (last) {
      [last.from, last.to].forEach(function (sq) {
        var file = "abcdefgh".indexOf(sq[0]);
        var rank = 8 - parseInt(sq[1], 10);
        ctx.fillStyle = LAST;
        ctx.fillRect(file * s, rank * s, s, s);
      });
    }
    legal.forEach(function (m) {
      var file = "abcdefgh".indexOf(m.to[0]);
      var rank = 8 - parseInt(m.to[1], 10);
      ctx.fillStyle = HI;
      ctx.beginPath();
      ctx.arc(file * s + s / 2, rank * s + s / 2, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
    });
    if (selected) {
      var file = "abcdefgh".indexOf(selected[0]);
      var rank = 8 - parseInt(selected[1], 10);
      ctx.strokeStyle = "#8B5CF6";
      ctx.lineWidth = 3;
      ctx.strokeRect(file * s + 2, rank * s + 2, s - 4, s - 4);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold " + Math.floor(s * 0.68) + "px serif";
    for (r = 0; r < 8; r++) {
      for (f = 0; f < 8; f++) {
        var p = board[r][f];
        if (!p) continue;
        var key = (p.color === "w" ? "w" : "b") + p.type.toUpperCase();
        ctx.fillStyle = p.color === "w" ? "#111" : "#111";
        ctx.fillText(GLYPH[key] || "?", f * s + s / 2, r * s + s / 2 + 1);
      }
    }
    updateStatus();
  }

  function updateStatus() {
    if (game.game_over()) {
      if (game.in_checkmate()) {
        statusEl.textContent = (game.turn() === "w" ? "Black" : "White") + " wins by checkmate";
      } else {
        statusEl.textContent = "Draw";
      }
      return;
    }
    if (game.turn() === "w") {
      statusEl.textContent = game.in_check() ? "Check — your move" : "Your turn (White)";
    } else {
      statusEl.textContent = "Black thinking…";
    }
  }

  function botMove() {
    if (game.game_over() || game.turn() !== "b") return;
    var moves = game.moves({ verbose: true });
    if (!moves.length) return;
    var m = moves[Math.floor(Math.random() * moves.length)];
    game.move(m);
    last = { from: m.from, to: m.to };
    selected = null;
    legal = [];
    render();
  }

  function onPointer(ev) {
    if (game.game_over() || game.turn() !== "w") return;
    ev.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var t = ev.changedTouches ? ev.changedTouches[0] : ev;
    var x = ((t.clientX - rect.left) / rect.width) * canvas.width;
    var y = ((t.clientY - rect.top) / rect.height) * canvas.height;
    var sq = xyToSq(x, y);
    if (!sq) return;

    if (selected) {
      var tryMove = legal.find(function (m) { return m.to === sq; });
      if (tryMove) {
        game.move({ from: selected, to: sq, promotion: "q" });
        last = { from: selected, to: sq };
        selected = null;
        legal = [];
        render();
        setTimeout(botMove, 380);
        return;
      }
    }

    var piece = game.get(sq);
    if (piece && piece.color === "w") {
      selected = sq;
      legal = game.moves({ square: sq, verbose: true });
      render();
    } else {
      selected = null;
      legal = [];
      render();
    }
  }

  canvas.addEventListener("click", onPointer);
  canvas.addEventListener("touchend", onPointer, { passive: false });
  document.getElementById("newBtn").onclick = function () {
    game.reset();
    selected = null;
    legal = [];
    last = null;
    render();
  };
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
  render();
})();

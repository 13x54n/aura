/** Inline mini-game HTML stubs — Lane A WebView packages (CLOCK IN cut). */

function shell(title: string, accent: string, bodyExtra = ""): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif;
      background: radial-gradient(ellipse at top, ${accent} 0%, #0C0B14 55%);
      color: #fff; display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 24px; text-align: center;
    }
    h1 { font-size: 36px; margin: 0 0 8px; font-weight: 800; }
    p { opacity: 0.8; max-width: 280px; line-height: 1.4; }
    .row { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 20px; }
    button {
      padding: 12px 20px; border-radius: 22px; border: 0; background: #8B5CF6;
      color: #fff; font-weight: 700; font-size: 15px;
    }
    button.ghost { background: rgba(255,255,255,0.12); }
    #log { margin-top: 18px; font-size: 11px; opacity: 0.55; max-width: 92%; white-space: pre-wrap; text-align: left; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>WebView runtime · Host SDK bridge stub</p>
  ${bodyExtra}
  <div class="row">
    <button id="addr">Get wallet</button>
    <button id="save" class="ghost">Save stub</button>
    <button id="close" class="ghost">Close</button>
  </div>
  <pre id="log"></pre>
  <script>
    const log = (m) => { const el = document.getElementById("log"); el.textContent += m + "\\n"; };
    const waitHost = () => new Promise((resolve) => {
      const t = setInterval(() => { if (window.AuraHost) { clearInterval(t); resolve(); } }, 40);
    });
    waitHost().then(async () => {
      try {
        const hs = await window.AuraHost.handshake();
        log("handshake " + JSON.stringify(hs));
        await window.AuraHost.ready();
      } catch (e) { log("handshake err " + e.message); }
      document.getElementById("addr").onclick = async () => {
        try { log("address " + JSON.stringify(await window.AuraHost.getAddress())); }
        catch (e) { log("err " + e.message); }
      };
      document.getElementById("save").onclick = async () => {
        try {
          await window.AuraHost.save("${title.toLowerCase()}.demo", { t: Date.now() });
          log("saved");
        } catch (e) { log("err " + e.message); }
      };
      document.getElementById("close").onclick = () => window.AuraHost.close();
    });
  </script>
</body>
</html>`;
}

export const GAME_HTML: Record<string, string> = {
  ludo: shell("Ludo", "#5B21B6", "<p>CLOCK IN deep path — rooms/escrow next</p>"),
  chess: shell("Chess", "#1E3A5F", "<p>Playable hub — pure skill escrow</p>"),
  snakes: shell(
    "Snakes &amp; Ladders",
    "#14532D",
    "<p>Playable hub — skill + fair dice</p>"
  ),
};

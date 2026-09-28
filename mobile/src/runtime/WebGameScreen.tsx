import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { CapabilityBroker } from "../host-sdk/CapabilityBroker";
import { handleHostRequest } from "../host-sdk/bridge";
import { useAuthorization } from "../utils/useAuthorization";
import { useMobileWallet } from "../utils/useMobileWallet";
import { GAME_HTML } from "./gameHtml";
import { LUDO_HTML } from "./ludoBundle";
import { CHESS_HTML } from "./chessBundle";
import { SNAKES_HTML } from "./snakesBundle";
import { matchService } from "../match/MatchService";
import { matchClient } from "../match/MatchClient";
import type { MatchCommand } from "../match/types";
import { GameHeader } from "../components/top-bar/GameHeader";
import { aura } from "../theme/tokens";

export type WebGameParams = {
  gameId: string;
  title: string;
  matchId?: string;
  roomCode?: string;
  mode?: "create" | "join" | "random";
  stake?: string;
  players?: number;
  escrowLocked?: boolean;
};

type Props = {
  route?: { params?: WebGameParams };
  navigation?: any;
};

const INJECTED = `
(function(){
  if (window.AuraHost) return true;
  var seq = 0;
  var pending = {};
  var eventListeners = [];
  function send(method, params) {
    return new Promise(function(resolve, reject) {
      var id = "h" + (++seq);
      pending[id] = { resolve: resolve, reject: reject };
      window.ReactNativeWebView.postMessage(JSON.stringify({
        id: id, type: "host.request", method: method, params: params || {}
      }));
    });
  }
  window.AuraHost = {
    handshake: function(){ return send("host.handshake"); },
    ready: function(){ return send("host.ready"); },
    getAddress: function(){ return send("wallet.getAddress"); },
    save: function(key, value){ return send("storage.save", { key: key, value: value }); },
    load: function(key){ return send("storage.load", { key: key }); },
    close: function(){ return send("nav.close"); },
    escrowStatus: function(){ return send("escrow.status"); },
    matchFinished: function(result){ return send("match.finished", result || {}); },
    matchCreate: function(){ return send("match.create"); },
    matchGet: function(matchId){ return send("match.get", { matchId: matchId }); },
    matchCommand: function(a, b){
      var cmd = b != null ? b : a;
      var id = b != null ? a : undefined;
      return send("match.command", { matchId: id, command: cmd });
    },
    onEvent: function(cb){
      if (typeof cb === "function") eventListeners.push(cb);
    },
  };
  function onMsg(e) {
    try {
      var data = typeof e.data === "string" ? e.data : (e.data && e.data.toString());
      var msg = JSON.parse(data);
      if (msg.type === "host.event") {
        for (var i = 0; i < eventListeners.length; i++) {
          try { eventListeners[i](msg.event, msg.payload); } catch (_) {}
        }
        return;
      }
      if (msg.type !== "host.response" || !pending[msg.id]) return;
      var p = pending[msg.id]; delete pending[msg.id];
      if (msg.ok) p.resolve(msg.result); else p.reject(new Error(msg.error || "host_error"));
    } catch (_) {}
  }
  document.addEventListener("message", onMsg);
  window.addEventListener("message", onMsg);
  true;
})();
true;
`;

/**
 * Play handoff: short loading → full-bleed WebView.
 * Back (nav.close or stack back) returns to previous shelf screen.
 */
export function WebGameScreen({ route, navigation }: Props) {
  const { gameId = "", title = "Game", matchId, roomCode, mode, stake, players, escrowLocked } = route?.params ?? {};
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const broker = useMemo(() => new CapabilityBroker(), []);
  const { selectedAccount } = useAuthorization();
  const { connect } = useMobileWallet();
  const storageRef = useRef<Record<string, string>>({});

  const html =
    gameId === "ludo"
      ? LUDO_HTML
      : gameId === "chess"
        ? CHESS_HTML
        : gameId === "snakes"
          ? SNAKES_HTML
          : GAME_HTML[gameId] ?? CHESS_HTML;

  const reply = useCallback((payload: object) => {
    const js = `window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(
      JSON.stringify(payload)
    )}}));true;`;
    webRef.current?.injectJavaScript(js);
  }, []);

  const emitHostEvent = useCallback((event: string, payload: any) => {
    const js = `window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(
      JSON.stringify({ type: "host.event", event, payload })
    )}}));true;`;
    webRef.current?.injectJavaScript(js);
  }, []);

  // Real-time Match Server Connection for Multiplayer
  useEffect(() => {
    if (!roomCode) return;

    let mounted = true;
    const unsub = matchClient.on("*", (msg: any) => {
      if (mounted) {
        emitHostEvent(msg.type, msg);
      }
    });

    (async () => {
      const ok = await matchClient.connect();
      if (!ok) {
        console.warn("[WebGameScreen] Could not connect to match server", matchClient.getServerUrl());
        if (mounted) emitHostEvent("match.unavailable", { url: matchClient.getServerUrl() });
        return;
      }
      if (matchClient.currentRoomCode !== roomCode) {
        if (mode === "create") {
          // Server supports 2p / 4p seatings; 3 players sit in the 4p layout.
          matchClient.createRoom(roomCode, (players ?? 2) <= 2 ? "2p" : "4p");
        } else if (mode === "random") {
          matchClient.joinRandom();
        } else {
          matchClient.joinRoom(roomCode);
        }
      }
    })();

    return () => {
      mounted = false;
      unsub();
      matchClient.leaveRoom();
    };
  }, [roomCode, mode, players, emitHostEvent]);

  const onMessage = useCallback(
    async (e: WebViewMessageEvent) => {
      const response = await handleHostRequest(e.nativeEvent.data, broker, {
        "wallet.getAddress": async () => {
          // Host owns wallet UI — never a second Connect surface inside the game.
          let account = selectedAccount;
          if (!account) {
            account = await connect();
          }
          return account?.publicKey.toBase58() ?? null;
        },
        "storage.save": async (params) => {
          const key = String(params?.key ?? "");
          storageRef.current[key] = JSON.stringify(params?.value ?? null);
          return true;
        },
        "storage.load": async (params) => {
          const key = String(params?.key ?? "");
          const raw = storageRef.current[key];
          return raw ? JSON.parse(raw) : null;
        },
        "haptics.light": async () => true,
        "escrow.status": async () => ({
          locked: !!escrowLocked,
          matchId: matchId ?? null,
        }),
        "match.create": async () => matchService.create(),
        "match.get": async (params) => {
          if (roomCode && matchClient.isConnected) {
            return {
              matchId: roomCode,
              roomCode,
              isMultiplayer: true,
              mySeat: matchClient.mySeat,
              seats: matchClient.currentState?.seats || [3, 0],
              state: matchClient.currentState,
            };
          }
          const id = String(params?.matchId ?? matchId ?? "");
          const snap = matchService.get(id);
          if (!snap) return { isMultiplayer: false };
          return snap;
        },
        "match.command": async (params) => {
          const cmd = (params?.command || params) as any;
          if (roomCode && matchClient.isConnected) {
            if (cmd?.type === "roll") {
              matchClient.sendRoll();
              return { ok: true };
            }
            if (cmd?.type === "move" && typeof cmd.pieceIndex === "number") {
              matchClient.sendMove(cmd.pieceIndex);
              return { ok: true };
            }
          }
          const id = String(params?.matchId ?? matchId ?? "");
          if (!cmd?.type) throw new Error("bad_command");
          return matchService.command(id, cmd);
        },
        "match.finished": async (params) => {
          // Room / staked matches hand off to the host payout screen.
          // Free Play stays on the board (no stake, no receipt).
          if (!roomCode) return { handled: false };
          navigation?.replace?.("LudoResult", {
            mode,
            won: !!params?.won,
            winnerName: params?.winnerName ? String(params.winnerName) : undefined,
            roomCode,
            stake: Number(stake ?? 0),
            players: players ?? 4,
          });
          return { handled: true };
        },
        "nav.close": async () => {
          navigation?.goBack?.();
          return true;
        },
      });
      if (response) reply(response);
    },
    [broker, connect, escrowLocked, matchId, mode, navigation, players, reply, roomCode, selectedAccount, stake]
  );

  return (
    <View style={styles.root}>
      <GameHeader
        gameId={gameId}
        title={title}
        onClose={() => navigation?.goBack?.()}
      />

      <View style={styles.gameContainer}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={aura.purpleBright} size="large" />
            <Text style={styles.loadingText}>Loading {title}…</Text>
          </View>
        ) : null}
        <WebView
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html }}
          onMessage={onMessage}
          injectedJavaScriptBeforeContentLoaded={INJECTED}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess={false}
          setSupportMultipleWindows={false}
          mixedContentMode="never"
          style={[styles.web, loading && styles.webHidden]}
          onLoadEnd={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  gameContainer: {
    flex: 1,
    position: "relative",
  },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    backgroundColor: "rgba(12, 11, 20, 0.96)",
    gap: 14,
  },
  loadingText: { color: aura.textMuted, fontWeight: "600" },
  web: { flex: 1, backgroundColor: "transparent" },
  webHidden: { opacity: 0 },
});

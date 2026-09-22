import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CapabilityBroker } from "../host-sdk/CapabilityBroker";
import { handleHostRequest } from "../host-sdk/bridge";
import { useAuthorization } from "../utils/useAuthorization";
import { useMobileWallet } from "../utils/useMobileWallet";
import { GAME_HTML } from "./gameHtml";
import { LUDO_HTML } from "./ludoBundle";
import { CHESS_HTML } from "./chessBundle";
import { SNAKES_HTML } from "./snakesBundle";
import { matchService } from "../match/MatchService";
import type { MatchCommand } from "../match/types";
import { aura } from "../theme/tokens";

export type WebGameParams = {
  gameId: string;
  title: string;
  matchId?: string;
  roomCode?: string;
  stake?: string;
  escrowLocked?: boolean;
};

type Props = {
  route: { params: WebGameParams };
  navigation: { goBack: () => void };
};

const INJECTED = `
(function(){
  if (window.AuraHost) return true;
  var seq = 0;
  var pending = {};
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
    matchCreate: function(){ return send("match.create"); },
    matchGet: function(matchId){ return send("match.get", { matchId: matchId }); },
    matchCommand: function(matchId, command){ return send("match.command", { matchId: matchId, command: command }); },
  };
  function onMsg(e) {
    try {
      var data = typeof e.data === "string" ? e.data : (e.data && e.data.toString());
      var msg = JSON.parse(data);
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
  const { gameId, title, matchId, escrowLocked } = route.params;
  const insets = useSafeAreaInsets();
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
          const id = String(params?.matchId ?? matchId ?? "");
          const snap = matchService.get(id);
          if (!snap) throw new Error("match_not_found");
          return snap;
        },
        "match.command": async (params) => {
          const id = String(params?.matchId ?? matchId ?? "");
          const cmd = params?.command as MatchCommand;
          if (!cmd?.type) throw new Error("bad_command");
          return matchService.command(id, cmd);
        },
        "nav.close": async () => {
          navigation.goBack();
          return true;
        },
      });
      if (response) reply(response);
    },
    [broker, connect, escrowLocked, matchId, navigation, reply, selectedAccount]
  );

  return (
    <View style={[styles.root, { paddingTop: loading ? insets.top : 0 }]}>
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
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: aura.bg },
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

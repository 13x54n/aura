import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { CapabilityBroker } from "../host-sdk/CapabilityBroker";
import { handleHostRequest } from "../host-sdk/bridge";
import { useAuthorization } from "../utils/useAuthorization";
import { useMobileWallet } from "../utils/useMobileWallet";
import { GameHeader } from "../components/top-bar/GameHeader";
import { aura } from "../theme/tokens";
import { recordPlay } from "../data/recentPlays";

export type WebGameParams = {
  gameId: string;
  title: string;
  /** Remote mini-game entry. Aura does not bundle game HTML. */
  entryUrl?: string;
  matchId?: string;
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
 * Play handoff: short loading → full-bleed WebView of a remote mini-game.
 * Back (nav.close or stack back) returns to the previous shelf screen.
 */
export function WebGameScreen({ route, navigation }: Props) {
  const { gameId = "", title = "Game", entryUrl, matchId, escrowLocked } = route?.params ?? {};
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(!!entryUrl);
  const [failed, setFailed] = useState(false);
  const broker = useMemo(() => new CapabilityBroker(), []);
  const { selectedAccount } = useAuthorization();
  const { connect } = useMobileWallet();
  const storageRef = useRef<Record<string, string>>({});

  const reply = useCallback((payload: object) => {
    const js = `window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(
      JSON.stringify(payload)
    )}}));true;`;
    webRef.current?.injectJavaScript(js);
  }, []);

  useEffect(() => {
    if (gameId && entryUrl) recordPlay(gameId);
  }, [gameId, entryUrl]);

  const close = useCallback(() => {
    navigation?.goBack?.();
  }, [navigation]);

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
        "nav.close": async () => {
          close();
          return true;
        },
      });
      if (response) reply(response);
    },
    [broker, close, connect, escrowLocked, matchId, reply, selectedAccount]
  );

  return (
    <View style={styles.root}>
      <GameHeader gameId={gameId} title={title} onClose={close} />

      <View style={styles.gameContainer}>
        {entryUrl && loading && !failed ? (
          <View style={styles.loading}>
            <ActivityIndicator color={aura.purpleBright} size="large" />
            <Text style={styles.loadingText}>Loading {title}…</Text>
          </View>
        ) : null}
        {entryUrl && !failed ? (
          <WebView
            ref={webRef}
            originWhitelist={["*"]}
            source={{ uri: entryUrl }}
            onMessage={onMessage}
            injectedJavaScriptBeforeContentLoaded={INJECTED}
            javaScriptEnabled
            domStorageEnabled
            allowFileAccess={false}
            setSupportMultipleWindows={false}
            style={[styles.web, loading && styles.webHidden]}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
          />
        ) : (
          <View style={styles.loading}>
            <Text style={styles.cardTitle}>{failed ? "Couldn't open this game" : "No game to open"}</Text>
            <Text style={styles.loadingText}>
              {failed
                ? "The mini-game URL didn't load. Go back to the store and try again."
                : "This listing has no entry URL yet."}
            </Text>
            <Pressable style={styles.cardGhost} onPress={close}>
              <Text style={styles.cardGhostText}>Back to store</Text>
            </Pressable>
          </View>
        )}
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
    padding: 24,
  },
  loadingText: { color: aura.textMuted, fontWeight: "600", textAlign: "center" },
  cardTitle: { color: aura.text, fontSize: 18, fontWeight: "800", textAlign: "center" },
  web: { flex: 1, backgroundColor: "transparent" },
  webHidden: { opacity: 0 },
  cardGhost: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: aura.glassBorder,
  },
  cardGhostText: { color: aura.purpleBright, fontWeight: "700" },
});

/**
 * Aura Match Client
 * Real-time WebSocket client connecting to the authoritative Ludo match server.
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Match server address, in priority order:
 * 1. EXPO_PUBLIC_MATCH_SERVER_URL (e.g. ws://192.168.1.20:3001 or wss://…)
 * 2. The Expo dev server's LAN host (so a real phone in Expo Go reaches the Mac)
 * 3. localhost / 10.0.2.2 (simulator / emulator)
 */
export function resolveMatchServerUrl(): string {
  const env = process.env.EXPO_PUBLIC_MATCH_SERVER_URL;
  if (env) return env;
  const hostUri: string | undefined =
    (Constants.expoConfig as any)?.hostUri ?? (Constants as any).expoGoConfig?.debuggerHost;
  const lan = hostUri?.split(":")[0];
  if (lan && lan !== "localhost" && lan !== "127.0.0.1") return `ws://${lan}:3001`;
  const host = Platform.OS === "android" ? "10.0.2.2" : "localhost";
  return `ws://${host}:3001`;
}

export type RoomMode = "2p" | "3p" | "4p";

export type PlayerInfo = {
  name: string;
  seat: number;
  connected?: boolean;
  graceUntil?: number | null;
};

/** Persisted per install: held seats and match history are keyed to this id. */
const PLAYER_ID_KEY = "aura.match.playerId";
const GUEST_NAME_KEY = "aura.match.guestName";
/** Table we're seated at, so the Ludo hub can offer Rejoin after an app reload. */
const LAST_ROOM_KEY = "aura.match.lastRoom";
// Ping every 5s; 15s of silence = dropped (grace / Retry kick in at ~15s).
const PING_EVERY_MS = 5_000;
const SILENCE_DROP_MS = 15_000;

/** Public table card from room.peek (all real server data). */
export type RoomInfo = {
  roomCode: string;
  host: string | null;
  mode: RoomMode;
  maxPlayers: number;
  seated: number;
  stake: number;
  status: "waiting" | "playing" | "completed";
};

/** One real, server-recorded match for this player. */
export type HistoryRow = {
  id: string;
  game: "Ludo" | "Chess" | "Snakes";
  code: string;
  kind: "private" | "quick";
  players: number;
  stake: number;
  result: "won" | "lost";
  place: number | null;
  delta: number;
  winnerName: string | null;
  endedAt: number;
};

export type Standing = { seat: number; name: string; place: number; forfeited: boolean };

export type MatchState = {
  roomCode: string;
  status: "waiting" | "playing" | "completed";
  mode: RoomMode;
  stake?: number;
  maxPlayers?: number;
  seats: number[];
  currentSeat: number;
  die: number | null;
  sixStreak: number;
  pieces: number[][];
  winner: number | null;
  players: Record<number, PlayerInfo>;
};

type Listener = (data: any) => void;

class MatchClient {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private serverUrl: string;
  public currentRoomCode: string | null = null;
  /** Last table we were seated at; survives a drop so Retry can rejoin it. */
  public lastRoomCode: string | null = null;
  /** Restored from storage on launch; cleared when that match ends or we leave. */
  public savedRoomCode: string | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeard = 0;
  public playerId = "aura-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  public guestName = "Guest " + Math.floor(1000 + Math.random() * 9000);
  private identityReady: Promise<void>;
  /** Last match.completed (real standings for the Result screen). */
  public lastCompleted: { roomCode: string | null; winner: number | null; standings: Standing[]; stake: number } | null = null;
  public mySeat: number | null = null;
  public currentState: MatchState | null = null;
  public isConnected = false;

  constructor() {
    this.serverUrl = resolveMatchServerUrl();
    this.identityReady = this.loadIdentity();
  }

  private async loadIdentity() {
    try {
      const [id, name, room] = await Promise.all([
        AsyncStorage.getItem(PLAYER_ID_KEY),
        AsyncStorage.getItem(GUEST_NAME_KEY),
        AsyncStorage.getItem(LAST_ROOM_KEY),
      ]);
      if (room) this.savedRoomCode = room;
      if (id) this.playerId = id;
      else await AsyncStorage.setItem(PLAYER_ID_KEY, this.playerId);
      if (name) this.guestName = name;
      else await AsyncStorage.setItem(GUEST_NAME_KEY, this.guestName);
    } catch {
      // Storage unavailable: keep the in-memory id for this session.
    }
  }

  setServerUrl(url: string) {
    this.serverUrl = url;
    if (this.ws) {
      this.disconnect();
    }
  }

  getServerUrl(): string {
    return this.serverUrl;
  }

  /** Wait for the persisted playerId / saved table to load. */
  ready(): Promise<void> {
    return this.identityReady;
  }

  private saveRoom(code: string | null) {
    this.savedRoomCode = code;
    (code ? AsyncStorage.setItem(LAST_ROOM_KEY, code) : AsyncStorage.removeItem(LAST_ROOM_KEY)).catch(() => {});
  }

  /** App-level heartbeat: 15s without any server message → treat as dropped so grace/Retry kick in. */
  private startHeartbeat(sock: WebSocket) {
    this.stopHeartbeat();
    this.lastHeard = Date.now();
    let lastPing = 0;
    // 1s tick: silence is caught within a second of the 15s mark; pings go out every 5s.
    this.pingTimer = setInterval(() => {
      if (this.ws !== sock) return this.stopHeartbeat();
      const now = Date.now();
      if (now - this.lastHeard >= SILENCE_DROP_MS) {
        this.dropSocket(sock);
        return;
      }
      if (now - lastPing < PING_EVERY_MS) return;
      lastPing = now;
      try {
        sock.send(JSON.stringify({ type: "ping", t: now }));
      } catch {
        this.dropSocket(sock);
      }
    }, 1000);
  }

  private stopHeartbeat() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  /** Silent drop: don't wait for the OS to notice; surface "disconnected" now. */
  private dropSocket(sock: WebSocket) {
    this.stopHeartbeat();
    if (this.ws !== sock) return;
    const wasConnected = this.isConnected;
    this.ws = null;
    this.isConnected = false;
    this.currentRoomCode = null;
    this.mySeat = null;
    try { sock.close(); } catch {}
    if (wasConnected) this.emit("disconnected", { reason: "heartbeat" });
  }

  async connect(customUrl?: string): Promise<boolean> {
    await this.identityReady;
    const url = customUrl || this.serverUrl;
    return new Promise((resolve) => {
      try {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
          resolve(true);
          return;
        }

        const sock = new WebSocket(url);
        this.ws = sock;

        const timeout = setTimeout(() => {
          if (sock.readyState !== WebSocket.OPEN) {
            // Drop only this attempt's half-open socket so Retry really reconnects
            // (never a newer socket from a later attempt).
            try { sock.close(); } catch (_) {}
            if (this.ws === sock) this.ws = null;
            resolve(false);
          }
        }, 3000);

        sock.onopen = () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.startHeartbeat(sock);
          this.emit("connected", { url });
          resolve(true);
        };

        sock.onmessage = (event) => {
          if (this.ws === sock) this.lastHeard = Date.now();
          try {
            const data = JSON.parse(event.data as string);
            this.handleMessage(data);
          } catch (e) {
            console.error("Failed to parse match server message:", e);
          }
        };

        sock.onerror = (err) => {
          console.warn("[MatchClient] WebSocket error:", err);
          this.emit("error", { error: "ws_error", details: err });
          resolve(false);
        };

        sock.onclose = () => {
          // Ignore closes from stale attempts once a newer socket exists.
          if (this.ws !== sock && this.ws !== null) return;
          if (this.ws === null && !this.isConnected) return; // already surfaced by dropSocket
          this.stopHeartbeat();
          const wasConnected = this.isConnected;
          this.isConnected = false;
          if (this.ws === sock) this.ws = null;
          // Server dropped us from the room; a Retry must rejoin, not assume we're seated.
          this.currentRoomCode = null;
          this.mySeat = null;
          if (wasConnected) this.emit("disconnected", {});
        };
      } catch (err) {
        resolve(false);
      }
    });
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.isConnected = false;
    this.currentRoomCode = null;
    this.mySeat = null;
    this.currentState = null;
  }

  private send(msg: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn("[MatchClient] Cannot send message, WebSocket not connected");
    }
  }

  private handleMessage(msg: any) {
    switch (msg.type) {
      case "room.created":
      case "room.joined":
        this.currentRoomCode = msg.roomCode;
        this.lastRoomCode = msg.roomCode;
        this.mySeat = msg.seat;
        this.currentState = msg.state;
        this.saveRoom(msg.roomCode);
        break;

      case "match.resync":
        this.currentRoomCode = msg.roomCode;
        this.lastRoomCode = msg.roomCode;
        this.mySeat = msg.yourSeat;
        this.currentState = msg.state;
        this.saveRoom(msg.roomCode);
        break;

      case "room.state":
        this.currentState = msg.state;
        break;

      case "match.started":
        if (msg.state) {
          this.currentState = msg.state;
        }
        break;

      case "pong":
        return; // heartbeat only
      case "error":
        if (msg.error === "forfeited" || msg.error === "room_not_found") this.saveRoom(null);
        break;

      case "turn.changed":
        if (this.currentState) {
          this.currentState.currentSeat = msg.currentSeat;
          this.currentState.die = null;
        }
        break;

      case "die.rolled":
        if (this.currentState) {
          this.currentState.die = msg.value;
          this.currentState.sixStreak = msg.sixStreak;
        }
        break;

      case "piece.moved":
        if (this.currentState && this.currentState.pieces[msg.seat]) {
          this.currentState.pieces[msg.seat][msg.pieceIndex] = msg.to;
        }
        break;

      case "match.completed":
        this.lastCompleted = {
          roomCode: this.currentRoomCode,
          winner: msg.winner ?? null,
          standings: Array.isArray(msg.standings) ? msg.standings : [],
          stake: Number(msg.stake ?? 0),
        };
        this.saveRoom(null);
        if (this.currentState) {
          this.currentState.status = "completed";
          this.currentState.winner = msg.winner;
        }
        break;
    }

    this.emit(msg.type, msg);
    this.emit("*", msg);
  }

  /** One-shot request: resolves with the first matching reply, or null on timeout / error. */
  private request<T>(msg: object, replyType: string, pick: (m: any) => T, ms = 4000): Promise<T | { error: string } | null> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: any) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        unsub();
        resolve(v);
      };
      const unsub = this.on("*", (m: any) => {
        if (m?.type === replyType) finish(pick(m));
        else if (m?.type === "error" && (m.error === "room_not_found" || m.error === "bad_request")) finish({ error: m.error });
      });
      const t = setTimeout(() => finish(null), ms);
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return finish(null);
      this.send(msg);
    });
  }

  /** Real table card for Join-by-code. */
  async peekRoom(roomCode: string): Promise<RoomInfo | { error: string } | null> {
    if (!(await this.connect())) return null;
    return this.request({ type: "room.peek", roomCode: roomCode.trim().toUpperCase() }, "room.info", (m) => m.info as RoomInfo);
  }

  /** This player's real completed matches (newest first). */
  async getHistory(): Promise<HistoryRow[] | null> {
    if (!(await this.connect())) return null;
    const r = await this.request({ type: "history.get", playerId: this.playerId }, "history", (m) => (m.rows ?? []) as HistoryRow[]);
    return Array.isArray(r) ? r : null;
  }

  createRoom(roomCode?: string, mode: RoomMode = "2p", playerName = "Player 1", stake = 0) {
    this.send({
      type: "room.create",
      roomCode,
      mode,
      stake,
      playerId: this.playerId,
      playerName,
    });
  }

  joinRoom(roomCode: string, playerName = "Player 2") {
    this.send({
      type: "room.join",
      roomCode: roomCode.trim().toUpperCase(),
      playerId: this.playerId,
      playerName,
    });
  }

  /** Retry after a drop: same playerId back to the same table (never a new create). */
  rejoin(): boolean {
    if (!this.lastRoomCode) return false;
    this.joinRoom(this.lastRoomCode);
    return true;
  }

  /** Real Quick match queue (same player count + stake). Never bots. */
  joinRandom(playerName = "Player", players = 2, stake = 0) {
    this.send({
      type: "room.random",
      players,
      stake,
      playerId: this.playerId,
      playerName,
    });
  }

  leaveQueue() {
    this.send({ type: "queue.leave" });
  }

  sendRoll() {
    this.send({
      type: "game.roll",
    });
  }

  sendMove(pieceIndex: number) {
    this.send({
      type: "game.move",
      pieceIndex,
    });
  }

  leaveRoom() {
    this.send({
      type: "room.leave",
    });
    this.saveRoom(null);
    this.currentRoomCode = null;
    this.mySeat = null;
    this.currentState = null;
  }

  on(event: string, callback: Listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.off(event, callback);
  }

  off(event: string, callback: Listener) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  private emit(event: string, data: any) {
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in MatchClient listener for ${event}:`, e);
        }
      }
    }
  }
}

export const matchClient = new MatchClient();


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
export function resolveFallbackLanUrl(): string | null {
  const hostUri: string | undefined =
    (Constants.expoConfig as any)?.hostUri ?? (Constants as any).expoGoConfig?.debuggerHost;
  const lan = hostUri?.split(":")[0];
  if (lan && lan !== "localhost" && lan !== "127.0.0.1") return `ws://${lan}:3001`;
  return null;
}

export function resolveMatchServerUrl(): string {
  const env = process.env.EXPO_PUBLIC_MATCH_SERVER_URL;
  if (env && !env.includes("eds-hans-greeting-por")) return env;
  const lan = resolveFallbackLanUrl();
  if (lan) return lan;
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
  result: "won" | "lost" | "refunded";
  place: number | null;
  delta: number;
  winnerName: string | null;
  endedAt: number;
  /** Staked tables only (explorer links for the on-chain legs). */
  depositSig?: string | null;
  payoutSig?: string | null;
  payoutUrl?: string | null;
  payout?: number | null;
  refundSig?: string | null;
  refundUrl?: string | null;
  reason?: string | null;
};

/** Server escrow capabilities (server.info). live=false → paid chips stay locked. */
export type EscrowInfo = {
  live: boolean;
  stakes: number[];
  feeBps?: number;
  mint?: string;
  cluster?: string;
  depositSecs?: number;
  refundAfterSecs?: number;
  /** RPC the phone submits deposits to (localnet on a device); null → app RPC setting. */
  clientRpc?: string | null;
};

export type EscrowSeatState = "waiting" | "signing" | "depositing" | "ready";
export type EscrowSnapshot = {
  phase: "filling" | "initializing" | "depositing" | "locked" | "settling" | "settled" | "settle_failed" | "refunding" | "refunded" | "refund_failed" | string;
  room: string | null;
  vault: string | null;
  mint: string | null;
  programId: string | null;
  cluster: string | null;
  stake: number;
  feeBps: number;
  pot: number;
  fee: number;
  payout: number;
  depositDeadline: number | null;
  depositMsLeft: number | null;
  initUrl: string | null;
  seats: Record<number, { chainSeat: number; wallet: string | null; state: EscrowSeatState; sig: string | null }>;
  error: string | null;
};

export type Payout = {
  amount: number;
  fee: number;
  pot: number;
  sig: string | null;
  url: string | null;
  resultHash: string | null;
  logUrl?: string | null;
  pending?: boolean;
};

export type RefundNotice = {
  roomCode: string;
  reason: string;
  stake: number;
  sig: string | null;
  url: string | null;
  refunded: string[];
  error: string | null;
  at: number;
};

/** Human copy for refund reasons ("… refunded · table didn't fill"). */
export const REFUND_REASON_TEXT: Record<string, string> = {
  deposit_timeout: "table didn't fill",
  player_left: "a player left before the start",
  cancelled: "table cancelled",
  no_winner: "match ended without a winner",
  abandoned: "table abandoned",
  server_error: "match couldn't start",
  time_limit: "match hit the time limit",
  wrong_wallet: "wallet mismatch",
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
  /** Staked tables only. */
  escrow?: EscrowSnapshot;
};

type Listener = (data: any) => void;


/** TLS + tunnel/DNS on a phone can take several seconds; LAN ws:// is near-instant. */
const connectTimeoutMs = (url: string) => (url.startsWith("wss://") ? 10_000 : 3_000);

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
  public lastCompleted: { roomCode: string | null; winner: number | null; standings: Standing[]; stake: number; reason?: string; payout?: Payout | null } | null = null;
  /** Last escrow refund that included us (Result/Hub notice + toast). */
  public lastRefund: RefundNotice | null = null;
  /** Connected wallet (base58) sent with create/join/random; required for staked tables. */
  public wallet: string | null = null;
  public escrowInfo: EscrowInfo = { live: false, stakes: [] };
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
    const ok = await this.tryConnect(url);
    if (ok) return true;

    // Resilient fallback: if connecting to a remote wss:// tunnel failed and we have a local LAN address, try LAN!
    if (!customUrl && url.startsWith("wss://")) {
      const lanUrl = resolveFallbackLanUrl();
      if (lanUrl && lanUrl !== url) {
        console.warn(`[MatchClient] Tunnel ${url} unreachable; falling back to LAN ${lanUrl}`);
        const lanOk = await this.tryConnect(lanUrl);
        if (lanOk) {
          this.serverUrl = lanUrl;
          return true;
        }
      }
    }
    return false;
  }

  private tryConnect(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          resolve(true);
          return;
        }
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          // Another caller is mid-handshake (slow over wss/TLS): wait for it
          // instead of reporting "connected" before the socket can send.
          const pending = this.ws;
          const started = Date.now();
          const wait = setInterval(() => {
            if (pending.readyState === WebSocket.OPEN) {
              clearInterval(wait);
              resolve(true);
            } else if (pending.readyState >= WebSocket.CLOSING || Date.now() - started > connectTimeoutMs(url)) {
              clearInterval(wait);
              resolve(false);
            }
          }, 100);
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
        }, connectTimeoutMs(url));

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
          const msg = (err as { message?: string })?.message;
          console.warn(
            `[MatchClient] Can't reach match server at ${sock.url || url}` +
              (msg ? ` (${msg})` : "") +
              (url.startsWith("wss://") ? " — check the phone's internet connection." : " — is it running, and is the phone on the same Wi-Fi?")
          );
          this.emit("error", { error: "ws_error", details: msg ?? "connection failed" });
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

      case "escrow.settled":
        if (this.lastCompleted && msg.payout) this.lastCompleted.payout = msg.payout;
        break;

      case "escrow.refunded":
        this.lastRefund = { ...msg, refunded: msg.refunded ?? [], at: Date.now() };
        this.saveRoom(null);
        break;

      case "server.info":
        if (msg.escrow) this.escrowInfo = msg.escrow;
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
          reason: msg.reason,
          payout: msg.payout ?? null,
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

  /** Reachability probe for the hub status pill: true only if the server answers a ping. */
  async checkServer(): Promise<boolean> {
    if (!(await this.connect())) return false;
    const r = await this.request({ type: "ping" }, "pong", () => true, 3000);
    return r === true;
  }

  /** Escrow capabilities; paid chips unlock only when the server says escrow is live. */
  async getServerInfo(): Promise<EscrowInfo> {
    if (!(await this.connect())) return this.escrowInfo;
    await this.request({ type: "server.info" }, "server.info", (m) => m.escrow, 3000);
    return this.escrowInfo;
  }

  setWallet(wallet: string | null) {
    this.wallet = wallet;
  }

  /** Ask the server for this seat's deposit tx (base64, unsigned, our wallet pays fees). */
  async buildDeposit(): Promise<{ tx: string } | { error: string; message?: string }> {
    const r = await this.escrowRequest({ type: "escrow.deposit.build" }, "escrow.deposit.tx", 15000);
    return r;
  }

  /** Relay the wallet-signed deposit; resolves once the server read the room account. */
  async submitDeposit(signedTx: string): Promise<{ sig: string; url: string; confirmed: boolean } | { error: string; message?: string }> {
    return this.escrowRequest({ type: "escrow.deposit.submit", tx: signedTx }, "escrow.deposit.sent", 60000);
  }

  /** Seat shows "Depositing…" while we're in the wallet (false = back to waiting). */
  depositSigning(active: boolean) {
    this.send({ type: "escrow.deposit.signing", active });
  }

  /** Confirm-deposit after the app submitted the tx itself: the server reads the room account. */
  async confirmDeposit(sig: string): Promise<{ ok: boolean; url?: string | null; message?: string | null; error?: string }> {
    const r = await this.escrowRequest({ type: "escrow.deposit.confirm", sig }, "escrow.deposit.confirmed", 30000);
    return r.error ? { ok: false, message: r.message, error: r.error } : r;
  }

  private escrowRequest(msg: object, replyType: string, ms: number): Promise<any> {
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
        if (m?.type === replyType) finish(m);
        else if (m?.type === "error") finish({ error: m.error, message: m.message });
      });
      const t = setTimeout(() => finish({ error: "timeout", message: "The match server didn't answer." }), ms);
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return finish({ error: "offline", message: "Not connected to the match server." });
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
      wallet: this.wallet ?? undefined,
    });
  }

  joinRoom(roomCode: string, playerName = "Player 2") {
    this.send({
      type: "room.join",
      roomCode: roomCode.trim().toUpperCase(),
      playerId: this.playerId,
      playerName,
      wallet: this.wallet ?? undefined,
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
      wallet: this.wallet ?? undefined,
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


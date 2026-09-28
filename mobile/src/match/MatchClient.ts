/**
 * Aura Match Client
 * Real-time WebSocket client connecting to the authoritative Ludo match server.
 */
import { Platform } from "react-native";

export type RoomMode = "2p" | "4p";

export type PlayerInfo = {
  name: string;
  seat: number;
};

export type MatchState = {
  roomCode: string;
  status: "waiting" | "playing" | "completed";
  mode: RoomMode;
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
  public mySeat: number | null = null;
  public currentState: MatchState | null = null;
  public isConnected = false;

  constructor() {
    // Default server address: 10.0.2.2 for Android emulator, localhost for iOS/web
    const host = Platform.OS === "android" ? "10.0.2.2" : "localhost";
    this.serverUrl = `ws://${host}:3001`;
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

  connect(customUrl?: string): Promise<boolean> {
    const url = customUrl || this.serverUrl;
    return new Promise((resolve) => {
      try {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
          resolve(true);
          return;
        }

        this.ws = new WebSocket(url);

        const timeout = setTimeout(() => {
          if (!this.isConnected) {
            resolve(false);
          }
        }, 3000);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.emit("connected", { url });
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data as string);
            this.handleMessage(data);
          } catch (e) {
            console.error("Failed to parse match server message:", e);
          }
        };

        this.ws.onerror = (err) => {
          console.warn("[MatchClient] WebSocket error:", err);
          this.emit("error", { error: "ws_error", details: err });
          resolve(false);
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          this.emit("disconnected", {});
        };
      } catch (err) {
        resolve(false);
      }
    });
  }

  disconnect() {
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
        this.mySeat = msg.seat;
        this.currentState = msg.state;
        break;

      case "room.state":
        this.currentState = msg.state;
        break;

      case "match.started":
        if (msg.state) {
          this.currentState = msg.state;
        }
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
        if (this.currentState) {
          this.currentState.status = "completed";
          this.currentState.winner = msg.winner;
        }
        break;
    }

    this.emit(msg.type, msg);
    this.emit("*", msg);
  }

  createRoom(roomCode?: string, mode: RoomMode = "2p", playerName = "Player 1") {
    this.send({
      type: "room.create",
      roomCode,
      mode,
      playerName,
    });
  }

  joinRoom(roomCode: string, playerName = "Player 2") {
    this.send({
      type: "room.join",
      roomCode: roomCode.trim().toUpperCase(),
      playerName,
    });
  }

  joinRandom(playerName = "Player") {
    this.send({
      type: "room.random",
      playerName,
    });
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


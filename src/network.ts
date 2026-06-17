import { Peer } from "peerjs";
import type { DataConnection } from "peerjs";

export type NetworkRole = "host" | "client" | null;

class NetworkManager {
  public peer: Peer | null = null;
  public conn: DataConnection | null = null;
  public role: NetworkRole = null;
  public peerId = "";
  public isConnected = false;

  private messageHandlers: Set<(data: any) => void> = new Set();
  private statusHandlers: Set<(status: string, details?: any) => void> = new Set();

  initPeer(onReady: (id: string) => void): void {
    if (this.peer) {
      if (this.peerId) {
        onReady(this.peerId);
      }
      return;
    }

    this.peer = new Peer();

    this.peer.on("open", (id) => {
      this.peerId = id;
      onReady(id);
    });

    this.peer.on("connection", (connection) => {
      if (this.role === "host") {
        this.conn = connection;
        this.setupConnection();
      } else {
        connection.close();
      }
    });

    this.peer.on("error", (err) => {
      console.error("PeerJS error:", err);
      this.notifyStatus("error", err.message);
    });
  }

  hostGame(onReady: (id: string) => void): void {
    this.role = "host";
    this.initPeer(onReady);
  }

  joinGame(hostId: string, onConnect: () => void): void {
    this.role = "client";
    this.initPeer(() => {
      if (!this.peer) return;
      this.conn = this.peer.connect(hostId);
      this.setupConnection();
      this.conn.on("open", () => {
        onConnect();
      });
    });
  }

  private setupConnection(): void {
    if (!this.conn) return;

    this.conn.on("open", () => {
      this.isConnected = true;
      this.notifyStatus("connected");
    });

    this.conn.on("data", (data) => {
      this.notifyMessage(data);
    });

    this.conn.on("close", () => {
      this.isConnected = false;
      this.notifyStatus("disconnected");
    });

    this.conn.on("error", (err) => {
      console.error("Connection error:", err);
      this.notifyStatus("error", err.message);
    });
  }

  send(data: any): void {
    if (this.conn && this.isConnected) {
      this.conn.send(data);
    }
  }

  onMessage(handler: (data: any) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatusChange(handler: (status: string, details?: any) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private notifyMessage(data: any): void {
    this.messageHandlers.forEach((handler) => handler(data));
  }

  private notifyStatus(status: string, details?: any): void {
    this.statusHandlers.forEach((handler) => handler(status, details));
  }

  disconnect(): void {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.role = null;
    this.peerId = "";
    this.isConnected = false;
    this.messageHandlers.clear();
    this.statusHandlers.clear();
  }
}

export const networkManager = new NetworkManager();
export default networkManager;

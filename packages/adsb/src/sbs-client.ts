import { createConnection, Socket } from "node:net";
import type { FlightState } from "@flightdna/core";

export interface SBSClientConfig {
  host?: string;      // default: "localhost"
  port?: number;      // default: 30003
  reconnect?: boolean; // default: true
  reconnectInterval?: number; // default: 5000
}

type SBSListener = (state: FlightState) => void;

export class SBSClient {
  private socket: Socket | null = null;
  private readonly config: Required<SBSClientConfig>;
  private listeners: SBSListener[] = [];
  private buffer = "";
  private running = false;

  // Track partial state from multiple message types
  private stateCache = new Map<string, Partial<FlightState> & { icao24: string; lastSeen: number }>();

  constructor(config: SBSClientConfig = {}) {
    this.config = {
      host: config.host ?? "localhost",
      port: config.port ?? 30003,
      reconnect: config.reconnect ?? true,
      reconnectInterval: config.reconnectInterval ?? 5000,
    };
  }

  onState(listener: SBSListener): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  connect(): void {
    if (this.running) return;
    this.running = true;
    this.doConnect();
  }

  disconnect(): void {
    this.running = false;
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  get isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  private doConnect(): void {
    this.socket = createConnection(this.config.port, this.config.host);

    this.socket.on("data", (data) => {
      this.buffer += data.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) this.parseSBSLine(line.trim());
      }
    });

    this.socket.on("error", () => {
      // Silently handle connection errors
    });

    this.socket.on("close", () => {
      this.socket = null;
      if (this.running && this.config.reconnect) {
        setTimeout(() => {
          if (this.running) this.doConnect();
        }, this.config.reconnectInterval);
      }
    });
  }

  private parseSBSLine(line: string): void {
    const fields = line.split(",");
    if (fields[0] !== "MSG" || fields.length < 22) return;

    const icao24 = fields[4]?.toLowerCase().trim();
    if (!icao24 || icao24.length !== 6) return;

    const msgType = parseInt(fields[1], 10);

    // Get or create cached state
    if (!this.stateCache.has(icao24)) {
      this.stateCache.set(icao24, { icao24, lastSeen: Date.now() });
    }
    const cached = this.stateCache.get(icao24)!;
    cached.lastSeen = Date.now();

    // Parse timestamp from fields 6+7 or use current time
    let timestamp = Date.now();
    if (fields[6] && fields[7]) {
      const parsed = Date.parse(`${fields[6]} ${fields[7]}`);
      if (!isNaN(parsed)) timestamp = parsed;
    }

    // Parse based on transmission type
    switch (msgType) {
      case 1: // Identification
        if (fields[10]?.trim()) {
          cached.aircraft = { ...cached.aircraft, icao24, callsign: fields[10].trim() };
        }
        break;
      case 3: // Airborne position
        if (fields[14] && fields[15]) {
          const lat = parseFloat(fields[14]);
          const lon = parseFloat(fields[15]);
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            const altFt = parseFloat(fields[11]) || 0;
            const gs = (parseFloat(fields[12]) || 0) * 0.514444; // kts to m/s
            const trk = parseFloat(fields[13]) || 0;
            const vr = (parseFloat(fields[16]) || 0) * 0.00508; // ft/min to m/s
            const onGround = fields[21]?.trim() === "-1";

            const state: FlightState = {
              aircraft: cached.aircraft ?? { icao24 },
              timestamp,
              position: { latitude: lat, longitude: lon, altitude: altFt * 0.3048 },
              velocity: { groundSpeed: gs, track: trk, verticalRate: vr },
              onGround,
              source: "sbs",
            };

            for (const listener of this.listeners) {
              listener(state);
            }
          }
        }
        break;
      case 4: // Velocity only
        // Update velocity in cache but don't emit (no position)
        if (fields[12]) {
          const gs = (parseFloat(fields[12]) || 0) * 0.514444;
          const trk = parseFloat(fields[13]) || 0;
          const vr = (parseFloat(fields[16]) || 0) * 0.00508;
          cached.velocity = { groundSpeed: gs, track: trk, verticalRate: vr };
        }
        break;
    }
  }

  /**
   * Prune stale entries from the state cache.
   */
  pruneCache(maxAgeMs: number = 60_000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [icao24, entry] of this.stateCache) {
      if (entry.lastSeen < cutoff) this.stateCache.delete(icao24);
    }
  }
}

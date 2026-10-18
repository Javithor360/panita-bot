import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { BridgeQueryError, BridgeUnavailableError, type BridgeLink, type ConnectionEvent } from './link';
import {
  BOT_FEATURES,
  CLOSE,
  MAX_FRAME_BYTES,
  PROTOCOL_VERSION,
  parseModFrame,
  readQueryData,
  type BotFrame,
  type HelloFrame,
  type ModFrame,
  type QueryData,
  type QueryKind,
  type ReplyFrame,
} from './protocol';

export const BRIDGE_PATH = '/bridge';

export interface BridgeServerOptions {
  /** The secret the mod sends as a bearer token. */
  key: string;
  /** The chat channels the bot bridges, read when a mod connects. */
  channels: () => string[];
  /** What the bot offers in its welcome; the optional features it really has. Defaults to `BOT_FEATURES`. */
  features?: () => readonly string[];
  /** Milliseconds between pings. */
  pingMs?: number;
  /** A connection that has not answered a ping for this long is dropped. */
  deadAfterMs?: number;
  /** How long a new connection has to say hello. */
  helloMs?: number;
  /** How long a question waits for its answer. */
  queryTimeoutMs?: number;
  maxFramesPerSecond?: number;
  logger?: Pick<Console, 'log' | 'error'>;
}

export interface BridgeStatus {
  connected: boolean;
  since: Date | null;
  hello: HelloFrame | null;
  framesIn: number;
  framesDropped: number;
  rejectedConnections: number;
  lastError: string | null;
}

interface Connection {
  socket: WebSocket;
  since: Date;
  hello: HelloFrame | null;
  lastPong: number;
  windowStart: number;
  windowCount: number;
  rateWarned: boolean;
  timers: NodeJS.Timeout[];
}

interface Pending {
  what: QueryKind;
  resolve(data: QueryData[QueryKind]): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * The WebSocket side of the bridge: one authenticated connection from the Minecraft server. It checks the key before the
 * upgrade, keeps a single connection (a new one replaces the old), pings it, limits what it accepts and turns the answers of
 * the mod into promises. It lives on the bot's existing HTTP server and never touches Discord.
 */
export class BridgeServer implements BridgeLink {
  private readonly sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  private readonly handlers: Array<(frame: ModFrame) => void> = [];
  private readonly connectionHandlers: Array<(event: ConnectionEvent) => void> = [];
  private readonly pending = new Map<string, Pending>();
  private readonly keyDigest: Buffer;
  private readonly pingMs: number;
  private readonly deadAfterMs: number;
  private readonly helloMs: number;
  private readonly queryTimeoutMs: number;
  private readonly maxFramesPerSecond: number;
  private readonly logger: Pick<Console, 'log' | 'error'>;
  private current: Connection | null = null;
  private icon: Buffer | null = null;
  private framesIn = 0;
  private framesDropped = 0;
  private rejected = 0;
  private lastError: string | null = null;

  constructor(private readonly options: BridgeServerOptions) {
    this.keyDigest = digest(options.key);
    this.pingMs = options.pingMs ?? 30_000;
    this.deadAfterMs = options.deadAfterMs ?? 60_000;
    this.helloMs = options.helloMs ?? 10_000;
    this.queryTimeoutMs = options.queryTimeoutMs ?? 5_000;
    this.maxFramesPerSecond = options.maxFramesPerSecond ?? 20;
    this.logger = options.logger ?? console;
  }

  /** Takes the upgrades of `/bridge` on an HTTP server. */
  attach(server: Server) {
    server.on('upgrade', (request, socket, head) => this.upgrade(request, socket, head));
  }

  get connected() {
    return this.current?.hello != null && this.current.socket.readyState === WebSocket.OPEN;
  }

  get serverIcon() {
    return this.icon;
  }

  get features(): readonly string[] {
    return this.connected ? (this.current?.hello?.features ?? []) : [];
  }

  status(): BridgeStatus {
    return {
      connected: this.connected,
      since: this.current?.since ?? null,
      hello: this.current?.hello ?? null,
      framesIn: this.framesIn,
      framesDropped: this.framesDropped,
      rejectedConnections: this.rejected,
      lastError: this.lastError,
    };
  }

  onFrame(handler: (frame: ModFrame) => void) {
    this.handlers.push(handler);
  }

  onConnection(handler: (event: ConnectionEvent) => void) {
    this.connectionHandlers.push(handler);
  }

  send(frame: BotFrame): boolean {
    const connection = this.current;
    if (!connection?.hello || connection.socket.readyState !== WebSocket.OPEN) return false;
    connection.socket.send(JSON.stringify(frame));
    return true;
  }

  request<K extends QueryKind>(what: K, options: { player?: string } = {}): Promise<QueryData[K]> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new BridgeQueryError('The Minecraft server did not answer'));
      }, this.queryTimeoutMs);
      this.pending.set(id, { what, resolve: resolve as Pending['resolve'], reject, timer });
      if (!this.send({ type: 'query', id, what, ...(options.player ? { player: options.player } : {}) })) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new BridgeUnavailableError());
      }
    });
  }

  /** Closes the connection and stops answering. */
  close() {
    this.current?.socket.close(1001, 'closing');
    this.sockets.close();
  }

  private upgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    const url = new URL(request.url ?? '/', 'http://bridge');
    if (url.pathname !== BRIDGE_PATH) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }
    if (!this.authorized(request.headers.authorization)) {
      // Only a count is kept: neither the key nor what was tried is ever logged.
      this.rejected++;
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return;
    }
    this.sockets.handleUpgrade(request, socket, head, ws => this.accept(ws));
  }

  /** Whether a bearer token is the bridge's key, compared in constant time. The upload endpoint uses the same key. */
  authorized(header: string | undefined): boolean {
    const match = header?.match(/^Bearer (.+)$/);
    return match !== null && match !== undefined && timingSafeEqual(digest(match[1]), this.keyDigest);
  }

  private accept(socket: WebSocket) {
    this.current?.socket.close(CLOSE.replaced, 'replaced');
    const connection: Connection = {
      socket,
      since: new Date(),
      hello: null,
      lastPong: Date.now(),
      windowStart: Date.now(),
      windowCount: 0,
      rateWarned: false,
      timers: [],
    };
    this.current = connection;

    connection.timers.push(
      setTimeout(() => {
        if (!connection.hello) socket.close(CLOSE.frame, 'hello expected');
      }, this.helloMs),
      setInterval(() => {
        if (Date.now() - connection.lastPong > this.deadAfterMs) {
          socket.terminate();
          return;
        }
        socket.ping();
      }, this.pingMs),
    );

    socket.on('pong', () => {
      connection.lastPong = Date.now();
    });
    socket.on('message', (data, isBinary) => this.receive(connection, data, isBinary));
    socket.on('error', error => {
      this.lastError = error.message;
    });
    socket.on('close', () => this.dropped(connection));
  }

  private dropped(connection: Connection) {
    connection.timers.forEach(timer => clearTimeout(timer));
    if (this.current !== connection) return;
    this.current = null;
    this.logger.log('[Bridge] The Minecraft server disconnected.');
    // A connection that never said hello was never the server
    if (connection.hello) this.tell({ type: 'disconnected' });
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new BridgeUnavailableError());
      this.pending.delete(id);
    }
  }

  private receive(connection: Connection, data: RawData, isBinary: boolean) {
    if (isBinary) return this.reject(connection, 'binary frame');
    const now = Date.now();
    if (now - connection.windowStart >= 1000) {
      connection.windowStart = now;
      connection.windowCount = 0;
      connection.rateWarned = false;
    }
    if (++connection.windowCount > this.maxFramesPerSecond) {
      this.framesDropped++;
      if (!connection.rateWarned) {
        connection.rateWarned = true;
        connection.socket.send(JSON.stringify({ type: 'error', code: 'rate', message: 'too many frames' } satisfies BotFrame));
      }
      return;
    }

    const parsed = parseModFrame(data.toString());
    if (!parsed.ok) return this.reject(connection, parsed.reason);
    this.framesIn++;
    const frame = parsed.frame;
    if (!frame) return;

    if (!connection.hello) {
      if (frame.type !== 'hello') return this.reject(connection, 'hello expected');
      return this.greet(connection, frame);
    }
    if (frame.type === 'hello') return;
    if (frame.type === 'reply') return this.answer(frame);
    for (const handler of this.handlers) {
      try {
        handler(frame);
      } catch (error) {
        this.logger.error('[Bridge] A frame handler failed:', error);
      }
    }
  }

  private greet(connection: Connection, hello: HelloFrame) {
    if (hello.protocol !== PROTOCOL_VERSION) {
      connection.socket.send(JSON.stringify({ type: 'error', code: 'protocol', message: `protocol ${PROTOCOL_VERSION} expected` } satisfies BotFrame));
      connection.socket.close(CLOSE.protocol, 'protocol mismatch');
      this.lastError = `the mod speaks protocol ${hello.protocol}`;
      return;
    }
    connection.hello = hello;
    this.icon = hello.icon ?? null;
    connection.socket.send(
      JSON.stringify({ type: 'welcome', protocol: PROTOCOL_VERSION, channels: this.options.channels(), features: this.options.features?.() ?? BOT_FEATURES } satisfies BotFrame),
    );
    this.logger.log(`[Bridge] The Minecraft server connected (mod ${hello.modVersion}, Minecraft ${hello.minecraftVersion}).`);
    this.tell({ type: 'connected', hello });
  }

  private tell(event: ConnectionEvent) {
    for (const handler of this.connectionHandlers) {
      try {
        handler(event);
      } catch (error) {
        this.logger.error('[Bridge] A connection handler failed:', error);
      }
    }
  }

  private answer(frame: ReplyFrame) {
    const pending = this.pending.get(frame.id);
    if (!pending) return;
    this.pending.delete(frame.id);
    clearTimeout(pending.timer);
    if (!frame.ok) return pending.reject(new BridgeQueryError(frame.error ?? 'error'));
    const data = readQueryData(pending.what, frame.data);
    if (data) pending.resolve(data);
    else pending.reject(new BridgeQueryError('The answer of the Minecraft server is not valid'));
  }

  private reject(connection: Connection, reason: string) {
    this.lastError = `invalid frame: ${reason}`;
    connection.socket.send(JSON.stringify({ type: 'error', code: 'frame', message: reason } satisfies BotFrame));
    connection.socket.close(CLOSE.frame, reason.slice(0, 100));
  }
}

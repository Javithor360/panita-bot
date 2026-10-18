import type { BotFrame, HelloFrame, ModFrame, QueryData, QueryKind } from './protocol';

/** The mod is not connected, so a question cannot be asked. */
export class BridgeUnavailableError extends Error {
  constructor() {
    super('The Minecraft server is not connected');
  }
}

/** The mod did not answer a question in time, or answered with an error. */
export class BridgeQueryError extends Error {}

/** The line to the server came up (after its hello) or went down. A connection that was replaced by a new one is neither. */
export type ConnectionEvent = { type: 'connected'; hello: HelloFrame } | { type: 'disconnected' };

/**
 * The line to the Minecraft server, as the rest of the bridge sees it. The WebSocket server is the first implementation;
 * a relay through the API could replace it without anything else changing.
 */
export interface BridgeLink {
  readonly connected: boolean;
  /** The icon of the Minecraft server as its last hello gave it, kept while the server is away; null when it sent none. */
  readonly serverIcon: Buffer | null;
  /** The optional features the connected mod announced in its hello; empty while nobody is connected. */
  readonly features: readonly string[];
  /** Sends a frame; false when nobody is connected. */
  send(frame: BotFrame): boolean;
  /** Asks the mod something and waits for its answer. */
  request<K extends QueryKind>(what: K): Promise<QueryData[K]>;
  /** Called with every frame the mod sends after its hello. */
  onFrame(handler: (frame: ModFrame) => void): void;
  /** Called when the mod connects and when it is lost. */
  onConnection(handler: (event: ConnectionEvent) => void): void;
}

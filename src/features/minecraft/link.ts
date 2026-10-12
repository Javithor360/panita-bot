import type { BotFrame, ModFrame, QueryData, QueryKind } from './protocol';

/** The mod is not connected, so a question cannot be asked. */
export class BridgeUnavailableError extends Error {
  constructor() {
    super('The Minecraft server is not connected');
  }
}

/** The mod did not answer a question in time, or answered with an error. */
export class BridgeQueryError extends Error {}

/**
 * The line to the Minecraft server, as the rest of the bridge sees it. The WebSocket server is the first implementation;
 * a relay through the API could replace it without anything else changing.
 */
export interface BridgeLink {
  readonly connected: boolean;
  /** Sends a frame; false when nobody is connected. */
  send(frame: BotFrame): boolean;
  /** Asks the mod something and waits for its answer. */
  request<K extends QueryKind>(what: K): Promise<QueryData[K]>;
  /** Called with every frame the mod sends after its hello. */
  onFrame(handler: (frame: ModFrame) => void): void;
}

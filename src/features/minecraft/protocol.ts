/**
 * The bridge protocol (version 1), shared by the bot and the Minecraft mod. Frames are JSON; everything that arrives from the
 * mod is untrusted, so it is checked for shape and size here before anything else sees it. See `docs/minecraft-bridge-plan.md`.
 */

export const PROTOCOL_VERSION = 1;
export const MAX_FRAME_BYTES = 16 * 1024;

/** WebSocket close codes of the bridge. */
export const CLOSE = { replaced: 4000, protocol: 4002, frame: 4003 } as const;

export interface BridgePlayer {
  uuid: string;
  name: string;
  /** What the player is called in chat, or null when they have no nickname. */
  nickname: string | null;
  /** Whether the name belongs to a Microsoft account; picks the head template. */
  premium: boolean;
}

export const EVENT_KINDS = ['join', 'first_join', 'leave', 'death', 'advancement', 'broadcast', 'started', 'stopping'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const QUERY_KINDS = ['playerlist', 'tps', 'status'] as const;
export type QueryKind = (typeof QUERY_KINDS)[number];

// Mod to bot

export interface HelloFrame {
  type: 'hello';
  protocol: number;
  modVersion: string;
  minecraftVersion: string;
  startedAt: string;
  maxPlayers: number;
}

export interface ChatFrame {
  type: 'chat';
  channel: string;
  player: BridgePlayer;
  text: string;
  emote: boolean;
}

export interface EventFrame {
  type: 'event';
  kind: EventKind;
  player?: BridgePlayer;
  /** The game's own English text for deaths and advancements, the message for a broadcast. */
  text?: string;
  /** The game's translation key, so a later version can translate `text`. */
  key?: string;
}

export interface ReplyFrame {
  type: 'reply';
  id: string;
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export type ModFrame = HelloFrame | ChatFrame | EventFrame | ReplyFrame;

// Bot to mod

export interface WelcomeFrame {
  type: 'welcome';
  protocol: number;
  /** The chat channels of the server that the bot bridges. */
  channels: string[];
}

export interface GameChatFrame {
  type: 'chat';
  channel: string;
  author: { discordId: string; ign: string };
  text: string;
}

export interface QueryFrame {
  type: 'query';
  id: string;
  what: QueryKind;
}

export interface ErrorFrame {
  type: 'error';
  code: 'protocol' | 'rate' | 'frame';
  message: string;
}

export type BotFrame = WelcomeFrame | GameChatFrame | QueryFrame | ErrorFrame;

// Answers of a query (`reply.data`)

export interface PlayerListData {
  online: { name: string; nickname: string | null }[];
  max: number;
}

export interface TpsData {
  tps: number;
  mspt: number;
}

export interface StatusData {
  online: number;
  max: number;
  tps: number;
  mspt: number;
  uptimeSeconds: number;
  version: string;
}

export interface QueryData {
  playerlist: PlayerListData;
  tps: TpsData;
  status: StatusData;
}

// Reading frames

export type Parsed =
  /** `frame` is null for a type this version does not know, which is ignored so a later version can add types. */
  | { ok: true; frame: ModFrame | null }
  | { ok: false; reason: string };

type Obj = Record<string, unknown>;

const isObject = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown, max: number, min = 0): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max;

const wholeNumber = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;

const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const PLAYER_NAME = /^[A-Za-z0-9_]{1,16}$/;
const CHANNEL = /^[a-z0-9_-]{1,32}$/;

const readPlayer = (value: unknown): BridgePlayer | null => {
  if (!isObject(value)) return null;
  const { uuid, name, nickname, premium } = value;
  if (typeof uuid !== 'string' || !UUID.test(uuid)) return null;
  if (typeof name !== 'string' || !PLAYER_NAME.test(name)) return null;
  if (nickname !== null && nickname !== undefined && !text(nickname, 32, 1)) return null;
  if (typeof premium !== 'boolean') return null;
  return { uuid, name, nickname: typeof nickname === 'string' ? nickname : null, premium };
};

const PLAYER_EVENTS: readonly EventKind[] = ['join', 'first_join', 'leave', 'death', 'advancement'];

/** Reads a frame from the mod. A frame of the wrong shape is rejected; one of an unknown type is skipped. */
export const parseModFrame = (raw: string): Parsed => {
  if (Buffer.byteLength(raw, 'utf8') > MAX_FRAME_BYTES) return { ok: false, reason: 'too large' };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'not json' };
  }
  if (!isObject(value) || typeof value.type !== 'string') return { ok: false, reason: 'no type' };

  switch (value.type) {
    case 'hello': {
      const { protocol, modVersion, minecraftVersion, startedAt, maxPlayers } = value;
      if (!wholeNumber(protocol, 1000) || !text(modVersion, 64) || !text(minecraftVersion, 32)) return { ok: false, reason: 'bad hello' };
      if (!text(startedAt, 40, 1) || Number.isNaN(Date.parse(startedAt)) || !wholeNumber(maxPlayers, 100_000)) return { ok: false, reason: 'bad hello' };
      return { ok: true, frame: { type: 'hello', protocol, modVersion, minecraftVersion, startedAt, maxPlayers } };
    }
    case 'chat': {
      const player = readPlayer(value.player);
      const { channel, text: line, emote } = value;
      if (!player || typeof channel !== 'string' || !CHANNEL.test(channel) || !text(line, 256, 1) || typeof emote !== 'boolean') {
        return { ok: false, reason: 'bad chat' };
      }
      return { ok: true, frame: { type: 'chat', channel, player, text: line, emote } };
    }
    case 'event': {
      const { kind, text: line, key } = value;
      if (typeof kind !== 'string' || !(EVENT_KINDS as readonly string[]).includes(kind)) return { ok: false, reason: 'bad event' };
      const eventKind = kind as EventKind;
      if ((line !== undefined && !text(line, 1024)) || (key !== undefined && !text(key, 128))) return { ok: false, reason: 'bad event' };
      const frame: EventFrame = { type: 'event', kind: eventKind };
      if (PLAYER_EVENTS.includes(eventKind)) {
        const player = readPlayer(value.player);
        if (!player) return { ok: false, reason: 'bad event' };
        frame.player = player;
      }
      if (typeof line === 'string') frame.text = line;
      if (typeof key === 'string') frame.key = key;
      return { ok: true, frame };
    }
    case 'reply': {
      const { id, ok, data, error } = value;
      if (!text(id, 64, 1) || typeof ok !== 'boolean') return { ok: false, reason: 'bad reply' };
      if (ok && !isObject(data)) return { ok: false, reason: 'bad reply' };
      if (!ok && !text(error, 64)) return { ok: false, reason: 'bad reply' };
      return { ok: true, frame: { type: 'reply', id, ok, data: ok ? (data as Obj) : undefined, error: ok ? undefined : (error as string) } };
    }
    default:
      return { ok: true, frame: null };
  }
};

/** Removes control characters, which have no place in a line of chat. */
export const withoutControlCharacters = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, '');

const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Checks the data of an answer to a query. The mod is untrusted, so what the commands show has been through here. */
export const readQueryData = <K extends QueryKind>(what: K, data: Record<string, unknown> | undefined): QueryData[K] | null => {
  if (!data) return null;
  const result = ((): QueryData[QueryKind] | null => {
    switch (what) {
      case 'playerlist': {
        const { online, max } = data;
        if (!Array.isArray(online) || online.length > 1000 || !wholeNumber(max, 100_000)) return null;
        const players: PlayerListData['online'] = [];
        for (const entry of online) {
          if (!isObject(entry) || typeof entry.name !== 'string' || !PLAYER_NAME.test(entry.name)) return null;
          if (entry.nickname !== null && entry.nickname !== undefined && !text(entry.nickname, 32, 1)) return null;
          players.push({ name: entry.name, nickname: typeof entry.nickname === 'string' ? entry.nickname : null });
        }
        return { online: players, max };
      }
      case 'tps': {
        const { tps, mspt } = data;
        return finite(tps, 0, 1000) && finite(mspt, 0, 100_000) ? { tps, mspt } : null;
      }
      case 'status': {
        const { online, max, tps, mspt, uptimeSeconds, version } = data;
        if (!wholeNumber(online, 100_000) || !wholeNumber(max, 100_000) || !finite(tps, 0, 1000) || !finite(mspt, 0, 100_000)) return null;
        if (!wholeNumber(uptimeSeconds, 10 ** 9) || !text(version, 32)) return null;
        return { online, max, tps, mspt, uptimeSeconds, version };
      }
    }
  })();
  return result as QueryData[K] | null;
};

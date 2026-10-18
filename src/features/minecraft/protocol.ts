/**
 * The bridge protocol (version 1), shared by the bot and the Minecraft mod. Frames are JSON; everything that arrives from the
 * mod is untrusted, so it is checked for shape and size here before anything else sees it. See `docs/minecraft-bridge-plan.md`.
 */

import { QUICK_UPLOAD, mediaTypeOf } from '../quickUpload/rules';

export const PROTOCOL_VERSION = 1;
export const MAX_FRAME_BYTES = 16 * 1024;
/** The longest line of chat that travels over the bridge, in characters. */
export const MAX_CHAT_LENGTH = 256;

/** The optional features the two sides announce in `hello` and `welcome` (section 4.4 of the plan); unknown ones are ignored. */
export const FEATURE_MEDIA = 'media';
export const FEATURE_MEDIA_UPLOAD = 'media_upload';
/** What the bot offers in its `welcome`. `media_upload` is added with the upload endpoint. */
export const BOT_FEATURES: readonly string[] = [FEATURE_MEDIA];

/** WebSocket close codes of the bridge. */
export const CLOSE = { replaced: 4000, protocol: 4002, frame: 4003 } as const;

export interface BridgePlayer {
  uuid: string;
  name: string;
  /** What the player is called in chat, or null when they have no nickname. */
  nickname: string | null;
  /** Whether the name belongs to a Microsoft account; picks the head template when the player has no skin. */
  premium: boolean;
  /** Hash of the skin the server shows the player with (SkinsRestorer's, when they chose one), or null. */
  skin: string | null;
}

export const EVENT_KINDS = ['join', 'first_join', 'leave', 'death', 'advancement', 'broadcast', 'started', 'stopping'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const QUERY_KINDS = ['playerlist', 'tps', 'status', 'playerinfo'] as const;
export type QueryKind = (typeof QUERY_KINDS)[number];

// Mod to bot

export interface HelloFrame {
  type: 'hello';
  protocol: number;
  modVersion: string;
  minecraftVersion: string;
  startedAt: string;
  maxPlayers: number;
  /** The icon of the server (a PNG), when the mod sent a valid one. */
  icon?: Buffer;
  /** The optional features the mod can use (see `FEATURE_MEDIA`); empty for a mod that announces none. */
  features: string[];
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
  /** The optional features the bot offers. */
  features: readonly string[];
}

/** An image of a Discord message, as the game shows it. The rules are in section 4.4 of the plan. */
export interface MediaEntry {
  url: string;
  name: string;
  type: string;
  size: number;
  width: number | null;
  height: number | null;
  spoiler: boolean;
}

export interface GameChatFrame {
  type: 'chat';
  channel: string;
  author: { discordId: string; ign: string };
  /** May be empty, but only when `media` has an entry. */
  text: string;
  /** Sent only to a mod that announced `FEATURE_MEDIA`; one to `MAX_MEDIA` entries. */
  media?: MediaEntry[];
}

export interface QueryFrame {
  type: 'query';
  id: string;
  what: QueryKind;
  /** The Minecraft name asked about; only for `playerinfo`. */
  player?: string;
}

export interface ErrorFrame {
  type: 'error';
  code: 'protocol' | 'rate' | 'frame';
  message: string;
}

export type BotFrame = WelcomeFrame | GameChatFrame | QueryFrame | ErrorFrame;

// Answers of a query (`reply.data`)

/** A piece of text with one style, as the mod gives it: the bot draws these and never sees a game text component. */
export interface TextRun {
  text: string;
  /** `#rrggbb`; absent for the default color. */
  color?: string;
  /** A font id such as `panita:ranks`; absent for the default font. */
  font?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
}

/** A player as the mod describes them. Everything after `nickname` is left out by a mod that does not know it. */
export interface ListedPlayer {
  name: string;
  nickname: string | null;
  uuid?: string;
  premium?: boolean;
  /** Hash of the skin the server shows them with. */
  skin?: string;
  /** Latency in milliseconds. */
  ping?: number;
  /** The line the server shows for them: rank, name, suffix. */
  display?: TextRun[];
}

export interface PlayerListData {
  online: ListedPlayer[];
  max: number;
}

export type PlayerInfoData =
  | { found: false }
  | { found: true; player: ListedPlayer; online: boolean; /** Null when the server has no record. */ playtimeSeconds: number | null };

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
  /** How many different players the server knows; a mod that does not report it leaves it out. */
  totalPlayers?: number;
}

export interface QueryData {
  playerlist: PlayerListData;
  tps: TpsData;
  status: StatusData;
  playerinfo: PlayerInfoData;
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

/** The largest icon that fits in a frame once it is base64: 10,000 bytes are about 13,400 characters of the 16 KiB. */
export const MAX_ICON_BYTES = 10_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** The icon of a hello, or undefined when it is not a PNG of a size the bridge accepts. Never fails the hello. */
const readIcon = (value: unknown): Buffer | undefined => {
  if (typeof value !== 'string' || value.length % 4 !== 0 || value.length > Math.ceil(MAX_ICON_BYTES / 3) * 4 || !BASE64.test(value)) {
    return undefined;
  }
  const bytes = Buffer.from(value, 'base64');
  return bytes.length <= MAX_ICON_BYTES && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ? bytes : undefined;
};

/** Where the images of Discord live; the mod checks the same list before it shows a link. */
export const MEDIA_HOSTS: readonly string[] = ['cdn.discordapp.com', 'media.discordapp.net', '*.klipy.com', '*.tenor.com', '*.giphy.com'];

/** Whether an image may be on this host: exactly one of the hosts, or one subdomain of a `*.` entry (never the domain itself). */
export const mediaHostAllowed = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  return MEDIA_HOSTS.some(allowed => (allowed.startsWith('*.') ? host.endsWith(allowed.slice(1)) && host.length > allowed.length - 1 : host === allowed));
};
export const MAX_MEDIA = 4;
const MAX_MEDIA_URL = 1024;
const MAX_MEDIA_NAME = 100;

/** The fields of a Discord attachment that a `media` entry is made from. */
export interface MediaSource {
  url: string;
  name: string;
  contentType: string | null;
  size: number;
  width: number | null;
  height: number | null;
  spoiler: boolean;
}

const hostAllowed = (url: string) => {
  if (url.length > MAX_MEDIA_URL) return false;
  try {
    const address = new URL(url);
    return address.protocol === 'https:' && mediaHostAllowed(address.hostname);
  } catch {
    return false;
  }
};

const dimension = (value: number | null) => (value !== null && Number.isInteger(value) && value > 0 && value <= 100_000 ? value : null);

/** The entry for an attachment, or null when it is not an image of a kind, size and address the game may show. */
export const toMediaEntry = (attachment: MediaSource): MediaEntry | null => {
  const type = mediaTypeOf(attachment);
  const { size } = attachment;
  if (!(QUICK_UPLOAD.imageTypes as readonly string[]).includes(type) || !Number.isInteger(size) || size < 0 || size > QUICK_UPLOAD.maxBytes) {
    return null;
  }
  if (!hostAllowed(attachment.url)) return null;
  const name = withoutControlCharacters(attachment.name).replace(/^SPOILER_/i, '').slice(0, MAX_MEDIA_NAME).trim();
  return {
    url: attachment.url,
    name: name || 'imagen',
    type,
    size,
    width: dimension(attachment.width),
    height: dimension(attachment.height),
    spoiler: attachment.spoiler,
  };
};

/** The first `MAX_MEDIA` images of a message that the game may show, in order. */
export const mediaOf = (attachments: Iterable<MediaSource>): MediaEntry[] => {
  const entries: MediaEntry[] = [];
  for (const attachment of attachments) {
    const entry = toMediaEntry(attachment);
    if (entry) entries.push(entry);
    if (entries.length === MAX_MEDIA) break;
  }
  return entries;
};

/** The features of a hello, never failing it: anything that is not a short name is left out, and so is the excess. */
const readFeatures = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((feature): feature is string => typeof feature === 'string' && /^[a-z0-9_]{1,32}$/.test(feature)).slice(0, 16) : [];

const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const PLAYER_NAME = /^[A-Za-z0-9_]{1,16}$/;
const CHANNEL = /^[a-z0-9_-]{1,32}$/;
const SKIN_HASH = /^[0-9a-f]{64}$/;

const readPlayer = (value: unknown): BridgePlayer | null => {
  if (!isObject(value)) return null;
  const { uuid, name, nickname, premium, skin } = value;
  if (typeof uuid !== 'string' || !UUID.test(uuid)) return null;
  if (typeof name !== 'string' || !PLAYER_NAME.test(name)) return null;
  if (nickname !== null && nickname !== undefined && !text(nickname, 32, 1)) return null;
  if (typeof premium !== 'boolean') return null;
  // The head is cosmetic: a skin that is not a hash is dropped, and the player is still accepted
  return {
    uuid,
    name,
    nickname: typeof nickname === 'string' ? nickname : null,
    premium,
    skin: typeof skin === 'string' && SKIN_HASH.test(skin) ? skin : null,
  };
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
      const icon = readIcon(value.icon);
      const features = readFeatures(value.features);
      return { ok: true, frame: { type: 'hello', protocol, modVersion, minecraftVersion, startedAt, maxPlayers, ...(icon ? { icon } : {}), features } };
    }
    case 'chat': {
      const player = readPlayer(value.player);
      const { channel, text: line, emote } = value;
      if (!player || typeof channel !== 'string' || !CHANNEL.test(channel) || !text(line, MAX_CHAT_LENGTH, 1) || typeof emote !== 'boolean') {
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

const COLOR = /^#[0-9a-f]{6}$/;
const FONT_ID = /^[a-z0-9_.-]{1,64}:[a-z0-9_./-]{1,128}$/;
const MAX_RUNS = 16;
const MAX_RUN_TEXT = 80;
const MARKS = ['bold', 'italic', 'underline', 'strikethrough', 'obfuscated'] as const;
const MARK_KEYS: Record<(typeof MARKS)[number], string> = { bold: 'b', italic: 'i', underline: 'u', strikethrough: 's', obfuscated: 'o' };

/** The runs of a line; null when any run is not the shape the bridge defines. */
const readRuns = (value: unknown): TextRun[] | null => {
  if (!Array.isArray(value) || value.length > MAX_RUNS) return null;
  const runs: TextRun[] = [];
  for (const entry of value) {
    if (!isObject(entry) || !text(entry.t, MAX_RUN_TEXT, 1)) return null;
    if (entry.c !== undefined && !(typeof entry.c === 'string' && COLOR.test(entry.c))) return null;
    if (entry.f !== undefined && !(typeof entry.f === 'string' && FONT_ID.test(entry.f))) return null;
    const run: TextRun = { text: entry.t };
    if (entry.c !== undefined) run.color = entry.c as string;
    if (entry.f !== undefined) run.font = entry.f as string;
    for (const mark of MARKS) {
      const flag = entry[MARK_KEYS[mark]];
      if (flag !== undefined && flag !== true) return null;
      if (flag === true) run[mark] = true;
    }
    runs.push(run);
  }
  return runs;
};

/** A player of an answer. The extra fields are cosmetic: one that is not valid is left out, and the player is still accepted. */
const readListedPlayer = (entry: unknown): ListedPlayer | null => {
  if (!isObject(entry) || typeof entry.name !== 'string' || !PLAYER_NAME.test(entry.name)) return null;
  if (entry.nickname !== null && entry.nickname !== undefined && !text(entry.nickname, 32, 1)) return null;
  const player: ListedPlayer = { name: entry.name, nickname: typeof entry.nickname === 'string' ? entry.nickname : null };
  if (typeof entry.uuid === 'string' && UUID.test(entry.uuid)) player.uuid = entry.uuid;
  if (typeof entry.premium === 'boolean') player.premium = entry.premium;
  if (typeof entry.skin === 'string' && SKIN_HASH.test(entry.skin)) player.skin = entry.skin;
  if (wholeNumber(entry.ping, 100_000)) player.ping = entry.ping;
  const display = readRuns(entry.display);
  if (display) player.display = display;
  return player;
};

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
          const player = readListedPlayer(entry);
          if (!player) return null;
          players.push(player);
        }
        return { online: players, max };
      }
      case 'playerinfo': {
        if (data.found === false) return { found: false };
        const player = readListedPlayer(data);
        if (data.found !== true || !player || typeof data.online !== 'boolean') return null;
        const seconds = wholeNumber(data.playtimeSeconds, 10 ** 10) ? data.playtimeSeconds : null;
        return { found: true, player, online: data.online, playtimeSeconds: seconds };
      }
      case 'tps': {
        const { tps, mspt } = data;
        return finite(tps, 0, 1000) && finite(mspt, 0, 100_000) ? { tps, mspt } : null;
      }
      case 'status': {
        const { online, max, tps, mspt, uptimeSeconds, version, totalPlayers } = data;
        if (!wholeNumber(online, 100_000) || !wholeNumber(max, 100_000) || !finite(tps, 0, 1000) || !finite(mspt, 0, 100_000)) return null;
        if (!wholeNumber(uptimeSeconds, 10 ** 9) || !text(version, 32)) return null;
        // Optional and cosmetic: one that is not a number is ignored instead of failing the whole answer
        const total = wholeNumber(totalPlayers, 10_000_000) ? { totalPlayers } : {};
        return { online, max, tps, mspt, uptimeSeconds, version, ...total };
      }
    }
  })();
  return result as QueryData[K] | null;
};

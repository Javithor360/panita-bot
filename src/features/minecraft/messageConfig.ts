import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { COLORS } from '../../config/constants';
import { isUrl, placeholdersIn } from './template';

/**
 * What the bot says for the Minecraft server, read from `config/minecraft-messages.yml`. The file is optional and so is each
 * key of it: whatever is missing or wrong is replaced by the default (and said in the log), so a typo never silences the bridge.
 */

export const EVENT_NAMES = ['join', 'first_join', 'leave', 'death', 'advancement', 'broadcast', 'started', 'stopping', 'crashed'] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** An author or a footer: a text with an icon and an address, or a title with an address. */
export interface Link {
  text: string;
  icon?: string;
  url?: string;
}

export interface Field {
  name: string;
  value: string;
  inline: boolean;
}

export interface EmbedSpec {
  color: number;
  /** Text sent above the embed. */
  content?: string;
  author?: Link;
  title?: Link;
  description?: string;
  thumbnail?: string;
  image?: string;
  footer?: Link;
  fields: Field[];
  timestamp: boolean;
}

/** `false` posts nothing, a text is a plain message, an embed is an embed. */
export type EventSpec = false | string | EmbedSpec;

export interface MessageConfig {
  events: Record<EventName, EventSpec>;
  chat: {
    /** The name of the webhook for what a player does with `/me`. */
    emoteName: string;
  };
  /** Seconds without the server before it counts as crashed. */
  crashAfterSeconds: number;
  topic: {
    online: string;
    offline: string;
  };
}

const COMMON = ['botname', 'botavatar', 'date'] as const;
const PLAYER = [...COMMON, 'displayname', 'username', 'avatar'] as const;

/** The placeholders each message has. `servericon` is added where an address is expected. */
export const EVENT_PLACEHOLDERS: Record<EventName, readonly string[]> = {
  join: PLAYER,
  first_join: PLAYER,
  leave: PLAYER,
  death: [...PLAYER, 'deathmessage'],
  advancement: [...PLAYER, 'achievement'],
  broadcast: [...COMMON, 'message'],
  started: COMMON,
  stopping: COMMON,
  crashed: [...COMMON, 'guildowner'],
};
export const CHAT_PLACEHOLDERS = ['displayname', 'username'] as const;
export const TOPIC_PLACEHOLDERS = ['playercount', 'playermax', 'tps', 'uptimemins', 'uptimehours', 'serverversion', 'totalplayers'] as const;

const SERVER_ICON = 'servericon';
const MAX_FIELDS = 25;

const playerEvent = (color: number, author: string): EmbedSpec => ({
  color,
  author: { text: author, icon: '{avatar}' },
  fields: [],
  timestamp: false,
});

/** The messages when there is no file, and the value of every key the file leaves out or gets wrong. */
export const DEFAULT_MESSAGES: MessageConfig = {
  events: {
    join: playerEvent(0x00ff00, '{displayname} entró al servidor'),
    first_join: playerEvent(0xffd700, '{displayname} entró al servidor por primera vez. ¡Bienvenido!'),
    leave: playerEvent(0xff0000, '{displayname} salió del servidor'),
    death: playerEvent(0x000000, '{deathmessage}'),
    advancement: playerEvent(0xffd700, '{displayname} completó el logro {achievement}'),
    broadcast: {
      color: COLORS.blurple,
      author: { text: 'Anuncio Oficial', icon: `{${SERVER_ICON}}` },
      description: '{message}',
      fields: [],
      timestamp: false,
    },
    started: ':rayThumbsup: **Server despierto**',
    stopping: ':rayEdgy: **El server se ha puesto a mimir.**',
    crashed: '{date} {guildowner}, el servidor ha colapsado 🔥‼️',
  },
  chat: { emoteName: '* {displayname}' },
  crashAfterSeconds: 90,
  topic: {
    online: '{playercount}/{playermax} jugadores en línea | Versión: {serverversion} | Activo por {uptimemins}m',
    offline: 'Server mimido <:rayEdgy:745510357715517560>',
  },
};

/** `config/minecraft-messages.yml`: the source and the build are both three folders below the project. */
export const MESSAGES_FILE = path.resolve(__dirname, '../../../config/minecraft-messages.yml');

type Warn = (message: string) => void;
type Parser<T> = (value: unknown, where: string) => T | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const warnUnknownKeys = (value: Record<string, unknown>, known: readonly string[], where: string, warn: Warn) => {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) warn(`${where ? `${where}.` : ''}${key} is not a known key and is ignored`);
  }
};

const textOf =
  (allowed: readonly string[], warn: Warn): Parser<string> =>
  (value, where) => {
    if (typeof value !== 'string') {
      warn(`${where} must be text`);
      return undefined;
    }
    const unknown = placeholdersIn(value).find(name => !allowed.includes(name));
    if (unknown) {
      warn(`${where} uses {${unknown}}, which is not available there`);
      return undefined;
    }
    return value;
  };

/** An address, or text that becomes one once its placeholders are filled. */
const urlOf =
  (allowed: readonly string[], warn: Warn): Parser<string> =>
  (value, where) => {
    const text = textOf([...allowed, SERVER_ICON], warn)(value, where);
    if (text === undefined || text === '' || placeholdersIn(text).length > 0) return text;
    if (!isUrl(text)) {
      warn(`${where} is not a link (it must start with http:// or https://)`);
      return undefined;
    }
    return text;
  };

const colorOf =
  (warn: Warn): Parser<number> =>
  (value, where) => {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff) return value;
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return Number.parseInt(value.slice(1), 16);
    warn(`${where} is not a color (write "#rrggbb" in quotes, or a number)`);
    return undefined;
  };

const booleanOf =
  (warn: Warn): Parser<boolean> =>
  (value, where) => {
    if (typeof value === 'boolean') return value;
    warn(`${where} must be true or false`);
    return undefined;
  };

/** A text, or `{ text, icon, url }`. `defaultIcon` is the icon when the author does not name one. */
const linkOf =
  (allowed: readonly string[], warn: Warn, defaultIcon?: string): Parser<Link> =>
  (value, where) => {
    const text = textOf(allowed, warn);
    if (typeof value === 'string') {
      const parsed = text(value, where);
      return parsed === undefined ? undefined : { text: parsed, icon: defaultIcon };
    }
    if (isRecord(value)) {
      warnUnknownKeys(value, ['text', 'icon', 'url'], where, warn);
      const parsed = text(value.text, `${where}.text`);
      if (parsed === undefined) return undefined;
      const icon = value.icon == null ? defaultIcon : urlOf(allowed, warn)(value.icon, `${where}.icon`);
      const url = value.url == null ? undefined : urlOf(allowed, warn)(value.url, `${where}.url`);
      return { text: parsed, icon, url };
    }
    warn(`${where} must be text or { text, icon, url }`);
    return undefined;
  };

const fieldsOf =
  (allowed: readonly string[], warn: Warn): Parser<Field[]> =>
  (value, where) => {
    if (!Array.isArray(value)) {
      warn(`${where} must be a list`);
      return undefined;
    }
    const text = textOf(allowed, warn);
    const fields: Field[] = [];
    value.forEach((entry: unknown, index) => {
      const at = `${where}[${index}]`;
      if (!isRecord(entry)) return warn(`${at} must have a name and a value`);
      warnUnknownKeys(entry, ['name', 'value', 'inline'], at, warn);
      if (!entry.name || !entry.value) return warn(`${at} needs a name and a value`);
      const name = text(entry.name, `${at}.name`);
      const fieldValue = text(entry.value, `${at}.value`);
      if (name === undefined || fieldValue === undefined) return;
      fields.push({ name, value: fieldValue, inline: typeof entry.inline === 'boolean' ? entry.inline : false });
    });
    if (fields.length > MAX_FIELDS) {
      warn(`${where} has more than ${MAX_FIELDS} fields; only the first ${MAX_FIELDS} are kept`);
      fields.length = MAX_FIELDS;
    }
    return fields;
  };

const EMBED_KEYS = ['color', 'content', 'author', 'title', 'description', 'thumbnail', 'image', 'footer', 'fields', 'timestamp'];

/** A key left out is left out of the embed; a key that is wrong takes the value of the default, when it has one. */
const embedOf = (raw: Record<string, unknown>, where: string, allowed: readonly string[], base: EmbedSpec | undefined, warn: Warn): EmbedSpec => {
  warnUnknownKeys(raw, EMBED_KEYS, where, warn);
  // In YAML an unquoted #ff0000 is a comment, so the color reads as empty
  if (raw.color === null) warn(`${where}.color is empty (a hex color goes in quotes: "#ff0000")`);
  const pick = <T>(key: keyof EmbedSpec, parser: Parser<T>, fallback: T | undefined): T | undefined =>
    raw[key] == null ? undefined : (parser(raw[key], `${where}.${key}`) ?? fallback);
  const text = textOf(allowed, warn);
  const url = urlOf(allowed, warn);
  return {
    color: (raw.color === null ? base?.color : pick('color', colorOf(warn), base?.color)) ?? COLORS.blurple,
    content: pick('content', text, base?.content),
    author: pick('author', linkOf(allowed, warn, allowed.includes('avatar') ? '{avatar}' : undefined), base?.author),
    title: pick('title', linkOf(allowed, warn), base?.title),
    description: pick('description', text, base?.description),
    thumbnail: pick('thumbnail', url, base?.thumbnail),
    image: pick('image', url, base?.image),
    footer: pick('footer', linkOf(allowed, warn), base?.footer),
    fields: pick('fields', fieldsOf(allowed, warn), base?.fields) ?? [],
    timestamp: pick('timestamp', booleanOf(warn), base?.timestamp) ?? false,
  };
};

const eventOf = (raw: unknown, name: EventName, warn: Warn): EventSpec => {
  const base = DEFAULT_MESSAGES.events[name];
  const where = `events.${name}`;
  if (raw == null || raw === true) return base;
  if (raw === false) return false;
  const allowed = EVENT_PLACEHOLDERS[name];
  if (typeof raw === 'string') return textOf(allowed, warn)(raw, where) ?? base;
  if (isRecord(raw)) return embedOf(raw, where, allowed, typeof base === 'object' ? base : undefined, warn);
  warn(`${where} must be false, text or an embed`);
  return base;
};

const section = (raw: unknown, where: string, known: readonly string[], warn: Warn): Record<string, unknown> => {
  if (raw == null) return {};
  if (!isRecord(raw)) {
    warn(`${where} must be a group of keys`);
    return {};
  }
  warnUnknownKeys(raw, known, where, warn);
  return raw;
};

const withDefault = <T>(value: unknown, where: string, parser: Parser<T>, fallback: T): T =>
  value == null ? fallback : (parser(value, where) ?? fallback);

const secondsOf =
  (warn: Warn): Parser<number> =>
  (value, where) => {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 3600) return value;
    warn(`${where} must be a whole number of seconds between 1 and 3600`);
    return undefined;
  };

/** Reads the text of the file. Pure: it returns what to log and never throws. */
export const parseMessageConfig = (source: string): { config: MessageConfig; warnings: string[] } => {
  const warnings: string[] = [];
  const warn: Warn = message => void warnings.push(message);
  const defaults = { config: DEFAULT_MESSAGES, warnings };

  let raw: unknown;
  try {
    raw = parse(source.replace(/^﻿/, ''), { logLevel: 'error' });
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : 'unknown error';
    warn(`the file is not valid YAML (${reason}); all the messages are the defaults`);
    return defaults;
  }
  if (raw == null) return defaults;
  if (!isRecord(raw)) {
    warn('the file must be a group of keys; all the messages are the defaults');
    return defaults;
  }

  warnUnknownKeys(raw, ['events', 'chat', 'crash_after_seconds', 'topic'], '', warn);
  const events = section(raw.events, 'events', EVENT_NAMES, warn);
  const chat = section(raw.chat, 'chat', ['emote_name'], warn);
  const topic = section(raw.topic, 'topic', ['online', 'offline'], warn);

  const config: MessageConfig = {
    events: Object.fromEntries(EVENT_NAMES.map(name => [name, eventOf(events[name], name, warn)])) as Record<EventName, EventSpec>,
    chat: {
      emoteName: withDefault(chat.emote_name, 'chat.emote_name', textOf(CHAT_PLACEHOLDERS, warn), DEFAULT_MESSAGES.chat.emoteName),
    },
    crashAfterSeconds: withDefault(raw.crash_after_seconds, 'crash_after_seconds', secondsOf(warn), DEFAULT_MESSAGES.crashAfterSeconds),
    topic: {
      online: withDefault(topic.online, 'topic.online', textOf(TOPIC_PLACEHOLDERS, warn), DEFAULT_MESSAGES.topic.online),
      offline: withDefault(topic.offline, 'topic.offline', textOf([], warn), DEFAULT_MESSAGES.topic.offline),
    },
  };
  return { config, warnings };
};

/** Reads the messages from a file; a missing or unreadable file gives the defaults. Each problem is logged once. */
export const loadMessageConfig = (file: string, logger: Pick<Console, 'log' | 'error'>): MessageConfig => {
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    logger.log(`[Minecraft] messages: ${file} was not found, so the default messages are used.`);
    return DEFAULT_MESSAGES;
  }
  const { config, warnings } = parseMessageConfig(source);
  for (const warning of warnings) logger.error(`[Minecraft] messages: ${warning}`);
  return config;
};

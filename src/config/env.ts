import { config } from 'dotenv';
import { DEFAULT_AVATAR_CRACKED, DEFAULT_AVATAR_PREMIUM } from '../lib/minecraft';
import { URLS } from './constants';

config();

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[Config] Missing required environment variable: ${name}`);
  }
  return value;
};

const optional = (name: string): string | undefined => process.env[name] || undefined;

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/** The API base URL. The service key travels in every request, so only https (or a local server) is accepted. */
const apiUrl = (): string => {
  const raw = optional('PANITA_API_URL') ?? URLS.api;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('[Config] PANITA_API_URL is not a valid URL');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.includes(url.hostname))) {
    throw new Error('[Config] PANITA_API_URL must use https (http is only allowed for localhost)');
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
};

const SNOWFLAKE = /^\d{17,20}$/;

/** An optional Discord id. */
const optionalId = (name: string): string | undefined => {
  const value = optional(name);
  if (value !== undefined && !SNOWFLAKE.test(value)) throw new Error(`[Config] ${name} must be a Discord id`);
  return value;
};

/** The secret of the Minecraft bridge. Long enough to be a random key, never logged. */
const bridgeKey = (): string | undefined => {
  const value = optional('BRIDGE_KEY');
  if (value !== undefined && value.length < 16) throw new Error('[Config] BRIDGE_KEY must have at least 16 characters');
  return value;
};

/** A head template. It is fetched by Discord, so only http and https are accepted. */
const avatarTemplate = (name: string, fallback: string): string => {
  const value = optional(name) ?? fallback;
  if (!/^https?:\/\//.test(value)) throw new Error(`[Config] ${name} must be an http or https address`);
  return value;
};

const booleanFlag = (name: string, fallback: boolean): boolean => {
  const value = optional(name);
  return value === undefined ? fallback : ['1', 'true', 'yes', 'si'].includes(value.toLowerCase());
};

/** Minutes between runs of the Minecraft sync. Discord allows about two topic edits every ten minutes. */
const syncMinutes = (): number => Math.max(10, Number(optional('MC_SYNC_MINUTES') ?? 10) || 10);

/** The Cloudinary account of the website, which the quick upload of the gallery stores its photos in. */
export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/** Without a gallery channel there is no quick upload, so Cloudinary is only required together with it. */
const cloudinaryConfig = (galleryChannelId: string | undefined): CloudinaryConfig | undefined => {
  const cloudName = optional('CLOUDINARY_CLOUD_NAME');
  const apiKey = optional('CLOUDINARY_API_KEY');
  const apiSecret = optional('CLOUDINARY_API_SECRET');
  if (cloudName && apiKey && apiSecret) return { cloudName, apiKey, apiSecret };
  if (galleryChannelId) {
    throw new Error('[Config] GALLERY_CHANNEL_ID needs CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET');
  }
  return undefined;
};

const GALLERY_CHANNEL_ID = optionalId('GALLERY_CHANNEL_ID');

/**
 * Validated environment. This is the only module allowed to read `process.env`.
 */
export const env = {
  DISCORD_TOKEN: required('DISCORD_TOKEN'),
  PANITA_API_KEY: required('PANITA_API_KEY'),
  PANITA_API_URL: apiUrl(),
  STAFF_ROLE_ID: required('STAFF_ROLE_ID'),
  DEVELOPER_ID: required('DEVELOPER_ID'),
  ALT_ROLE_ID: required('ALT_ROLE_ID'),
  /** When set, slash commands are registered per-guild and events outside this guild are ignored. */
  GUILD_ID: optional('GUILD_ID'),
  /** Optional override; otherwise resolved from the token's application. */
  CLIENT_ID: optional('CLIENT_ID'),
  PORT: Number(optional('PORT') ?? 3005),
  /** Secret of the Minecraft bridge; without it the bridge is off. */
  BRIDGE_KEY: bridgeKey(),
  /** Discord channel of the global chat of the server, and (later) of its staff chat. */
  MC_CHANNEL_GLOBAL: optionalId('MC_CHANNEL_GLOBAL'),
  MC_CHANNEL_STAFF: optionalId('MC_CHANNEL_STAFF'),
  /** Role given to a linked member when they join the Minecraft server. */
  MC_JOINED_ROLE_ID: optionalId('MC_JOINED_ROLE_ID'),
  MC_AVATAR_PREMIUM: avatarTemplate('MC_AVATAR_PREMIUM', DEFAULT_AVATAR_PREMIUM),
  MC_AVATAR_CRACKED: avatarTemplate('MC_AVATAR_CRACKED', DEFAULT_AVATAR_CRACKED),
  MC_TOPIC_TEMPLATE: optional('MC_TOPIC_TEMPLATE') ?? '🟢 {online}/{max} jugadores · TPS {tps} · activo hace {uptime}',
  /** While true the sync only logs what it would change. */
  MC_SYNC_DRY_RUN: booleanFlag('MC_SYNC_DRY_RUN', true),
  MC_SYNC_MINUTES: syncMinutes(),
  /** Public channel (`#comandos`) for a password reset when the member's DMs are closed and they agree to it. Without it that fallback fails. */
  PASSWORD_RESET_CHANNEL_ID: optionalId('PASSWORD_RESET_CHANNEL_ID'),
  /** Channel where a trusted author's photo post can be sent to the gallery with their own 👍. Without it the quick upload is off. */
  GALLERY_CHANNEL_ID,
  CLOUDINARY: cloudinaryConfig(GALLERY_CHANNEL_ID),
  isProduction: process.env.NODE_ENV === 'production',
} as const;

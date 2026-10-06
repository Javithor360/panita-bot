import { config } from 'dotenv';
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

/**
 * Validated environment. This is the only module allowed to read `process.env`.
 */
export const env = {
  DISCORD_TOKEN: required('DISCORD_TOKEN'),
  PANITA_API_KEY: required('PANITA_API_KEY'),
  PANITA_API_URL: apiUrl(),
  DATABASE_URL: required('DATABASE_URL'),
  DIRECT_URL: required('DIRECT_URL'),
  STAFF_ROLE_ID: required('STAFF_ROLE_ID'),
  DEVELOPER_ID: required('DEVELOPER_ID'),
  ALT_ROLE_ID: required('ALT_ROLE_ID'),
  /** When set, slash commands are registered per-guild and events outside this guild are ignored. */
  GUILD_ID: optional('GUILD_ID'),
  /** Optional override; otherwise resolved from the token's application. */
  CLIENT_ID: optional('CLIENT_ID'),
  PORT: Number(optional('PORT') ?? 3005),
  isProduction: process.env.NODE_ENV === 'production',
} as const;

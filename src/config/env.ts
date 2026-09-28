import { config } from 'dotenv';

config();

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[Config] Missing required environment variable: ${name}`);
  }
  return value;
};

const optional = (name: string): string | undefined => process.env[name] || undefined;

/**
 * Validated environment. This is the only module allowed to read `process.env`.
 */
export const env = {
  DISCORD_TOKEN: required('DISCORD_TOKEN'),
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

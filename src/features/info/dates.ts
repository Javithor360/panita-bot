import { discordTimestamp } from '../../lib/format';

/** Noa's "Creada el 21/Aug/2018 (Hace 693 días)", with Discord timestamps so each viewer sees their own timezone. */
export const dateWithAge = (date: Date | number): string => `${discordTimestamp(date, 'D')} (${discordTimestamp(date, 'R')})`;

const DISCORD_EPOCH = 1420070400000n;

/** When a Discord id (a snowflake) was created. */
export const snowflakeDate = (id: string): Date => new Date(Number((BigInt(id) >> 22n) + DISCORD_EPOCH));

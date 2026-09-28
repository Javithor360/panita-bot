import type { Guild, GuildMember, PartialGuildMember, User } from 'discord.js';
import { env } from '../config/env';

export const isDeveloper = (userId: string) => userId === env.DEVELOPER_ID;

/** Staff role holders; the developer is always treated as staff. */
export const isStaff = (member: GuildMember | null | undefined) =>
  !!member && (member.roles.cache.has(env.STAFF_ROLE_ID) || isDeveloper(member.id));

/** Secondary (alt) accounts are marked with a dedicated role and excluded from the web platform. */
export const isAltAccount = (member: GuildMember | PartialGuildMember | null | undefined) =>
  !!member?.roles.cache.has(env.ALT_ROLE_ID);

/** Whether an event from this guild should be processed (all guilds when GUILD_ID is not set). */
export const isHomeGuild = (guild: Guild) => !env.GUILD_ID || guild.id === env.GUILD_ID;

/** Avatar URL stored in the database. A member resolves to their server avatar when they have one. */
export const avatarUrlOf = (target: User | GuildMember) => target.displayAvatarURL({ size: 256, extension: 'png' });

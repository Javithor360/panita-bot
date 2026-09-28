import type { GuildMember } from 'discord.js';
import { env } from '../config/env';

export const isDeveloper = (userId: string) => userId === env.DEVELOPER_ID;

/** Staff role holders; the developer is always treated as staff. */
export const isStaff = (member: GuildMember | null | undefined) =>
  !!member && (member.roles.cache.has(env.STAFF_ROLE_ID) || isDeveloper(member.id));

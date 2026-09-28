import type { Client, Guild, GuildMember, PartialGuildMember, User } from 'discord.js';
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

const DISCORD_ATTACHMENT_URL = /^https:\/\/(cdn|media)\.discordapp\.(com|net)\/attachments\//;

interface RefreshUrlsResponse {
  refreshed_urls: Array<{ original: string; refreshed: string }>;
}

/**
 * Discord attachment URLs are signed and expire, so stored ones (e.g. tag images) stop working.
 * This asks Discord for fresh signatures. Other URLs are returned untouched, and on failure the
 * original URLs are returned.
 */
export const refreshAttachmentUrls = async (client: Client, urls: string[]): Promise<string[]> => {
  const attachmentUrls = urls.filter(url => DISCORD_ATTACHMENT_URL.test(url));
  if (attachmentUrls.length === 0) return urls;

  try {
    const response = await client.rest.post('/attachments/refresh-urls', {
      body: { attachment_urls: attachmentUrls },
    }) as RefreshUrlsResponse;
    const refreshed = new Map(response.refreshed_urls.map(r => [r.original, r.refreshed]));
    return urls.map(url => refreshed.get(url) ?? url);
  } catch (error) {
    console.warn('[Discord] Could not refresh attachment URLs:', error);
    return urls;
  }
};

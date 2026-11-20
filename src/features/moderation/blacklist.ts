import { escapeMarkdown, type GuildMember } from 'discord.js';
import { isStaff } from '../../lib/discord';
import { discordTimestamp } from '../../lib/format';
import { fail, type Who } from '../../lib/voice';
import { blacklistEntryOf, type BlacklistEntry } from '../../services/blacklist';
import { clip } from './messages';

const REASON_SHOWN = 200;

/** What a barred member reads instead of the answer of the command. */
export const blacklistMessage = (who: Who | null, entry: BlacklistEntry): string => {
  const until = entry.expires_at ? ` hasta el ${discordTimestamp(new Date(entry.expires_at), 'f')}` : '';
  return fail(who, `estás en la lista negra${until} y no puedes usar el bot. Razón: ${escapeMarkdown(clip(entry.reason, REASON_SHOWN))}`);
};

/**
 * The refusal for a member on the blacklist, or `null` when they may go on. The Staff is never blocked, and when the
 * API cannot answer the member goes on too (see `blacklistEntryOf`).
 */
export const blacklistDenial = async (member: GuildMember | null, userId = member?.id, who: Who | null = member): Promise<string | null> => {
  if (!userId || isStaff(member)) return null;
  const entry = await blacklistEntryOf(userId);
  return entry ? blacklistMessage(who, entry) : null;
};

/** One line per entry in `blacklist list`. */
export const blacklistLine = (entry: BlacklistEntry): string => {
  const reason = escapeMarkdown(clip(entry.reason, REASON_SHOWN));
  const until = entry.expires_at ? ` · hasta ${discordTimestamp(new Date(entry.expires_at), 'R')}` : ' · permanente';
  return `<@${entry.user_id}> (\`${entry.user_id}\`) · ${reason} · <@${entry.moderator_id}> ${discordTimestamp(new Date(entry.created_at), 'R')}${until}`;
};

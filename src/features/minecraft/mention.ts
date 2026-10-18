import type { BaseMessageOptions } from 'discord.js';

/**
 * The answer of a command with the member mentioned and nobody notified: the mention is written in the message, but
 * `allowedMentions` is empty, so it shows as a mention and sends no ping (not even the one a reply carries).
 */
export const withSilentMention = (userId: string, payload: BaseMessageOptions): BaseMessageOptions => ({
  ...payload,
  content: `<@${userId}>`,
  allowedMentions: { parse: [], repliedUser: false },
});

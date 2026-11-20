import type { Message } from 'discord.js';
import { PREFIX } from '../config/constants';
import { accessDenial } from '../core/access';
import { createPrefixContext } from '../core/context';
import { blacklistDenial } from '../features/moderation/blacklist';
import { conversations } from '../features/ask/conversations';
import { askFromMention, askFromReply } from '../features/ask/mention';
import { SLASH_ONLY_ERROR, userMessageFor } from '../core/errors';
import { parsePrefixArgs } from '../core/prefixParser';
import type { CommandRegistry } from '../core/registry';
import { formatParseError } from '../core/usage';

const EMPTY_PARSE = { group: null, subcommand: null, values: new Map() };

/**
 * @param bareCommandOf the command a message stands for without the prefix (in a channel that allows it), or null
 */
export const createMessageHandler =
  (registry: CommandRegistry, bareCommandOf: (message: Message) => string | null = () => null) =>
  async (message: Message) => {
  if (message.author.bot || !message.inGuild()) return;
  // A mention of the bot or a reply to one of its answers is `!ask <text>`; a channel may also allow a command without the prefix
  const content = askFromMention(message.content, message.client.user?.id)
    ?? askFromReply(message.content, message.reference?.messageId, conversations)
    ??(bareCommandOf(message) !== null ? PREFIX + message.content.trim() : message.content);
  if (!content.startsWith(PREFIX)) return;

  const body = content.slice(PREFIX.length);
  const head = body.match(/^(\S+)\s*/);
  if (!head) return;

  const name = head[1].toLowerCase();
  const rawArgs = body.slice(head[0].length);
  const command = registry.resolve(name);
  if (!command) return;

  const commandName = command.data.name;
  const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return;

  const reply = (content: string) => message.reply({ content, allowedMentions: { repliedUser: false } }).catch(() => {});

  if (command.meta.slashOnly) return reply(SLASH_ONLY_ERROR(commandName, member));

  const denial = accessDenial(command.meta.access, member);
  if (denial) return reply(denial);

  const barred = await blacklistDenial(member);
  if (barred) return reply(barred);

  const schema = registry.schemaOf(command);
  const fallback = command.prefix?.fallback;
  const parsed = parsePrefixArgs(rawArgs, schema, {
    defaultSubcommand: command.prefix?.defaultSubcommand,
    subcommandAliases: command.prefix?.subcommandAliases,
    hasFallback: !!fallback,
    attachmentCount: message.attachments.size,
  });

  if (parsed.kind === 'error') {
    return reply(formatParseError(PREFIX, commandName, schema, parsed, fallback ? [fallback.usage] : [], member));
  }

  try {
    const ctx = await createPrefixContext(message, member, commandName, parsed.kind === 'ok' ? parsed : EMPTY_PARSE);
    if (typeof ctx === 'string') return reply(ctx);

    if (parsed.kind === 'fallback') await fallback!.run(ctx, parsed.rawArgs);
    else await command.run(ctx);
  } catch (error) {
    await reply(userMessageFor(error, commandName, 'Prefix', member));
  }
};

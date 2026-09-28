import type { Message } from 'discord.js';
import { PREFIX } from '../config/constants';
import { accessDenial } from '../core/access';
import { createPrefixContext } from '../core/context';
import { SLASH_ONLY_ERROR, userMessageFor } from '../core/errors';
import { runLegacyPrefix } from '../core/legacy';
import { parsePrefixArgs } from '../core/prefixParser';
import type { CommandRegistry } from '../core/registry';
import { formatParseError } from '../core/usage';

const EMPTY_PARSE = { group: null, subcommand: null, values: new Map() };

export const createMessageHandler = (registry: CommandRegistry) => async (message: Message) => {
  if (message.author.bot || !message.inGuild() || !message.content.startsWith(PREFIX)) return;

  const body = message.content.slice(PREFIX.length);
  const head = body.match(/^(\S+)\s*/);
  if (!head) return;

  const name = head[1].toLowerCase();
  const rawArgs = body.slice(head[0].length);
  const command = registry.resolve(name);

  if (!command) {
    const legacy = registry.legacy.get(name);
    if (!legacy) return;
    const args = rawArgs.trim().split(/ +/).filter(Boolean);
    try {
      await runLegacyPrefix(legacy, message, name, args);
    } catch (error) {
      await message.reply(userMessageFor(error, name, 'Prefix')).catch(() => {});
    }
    return;
  }

  const commandName = command.data.name;
  const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return;

  const reply = (content: string) => message.reply(content).catch(() => {});

  if (command.meta.slashOnly) return reply(SLASH_ONLY_ERROR(commandName));

  const denial = accessDenial(command.meta.access, member);
  if (denial) return reply(denial);

  const schema = registry.schemaOf(command);
  const fallback = command.prefix?.fallback;
  const parsed = parsePrefixArgs(rawArgs, schema, {
    defaultSubcommand: command.prefix?.defaultSubcommand,
    subcommandAliases: command.prefix?.subcommandAliases,
    hasFallback: !!fallback,
    attachmentCount: message.attachments.size,
  });

  if (parsed.kind === 'error') {
    return reply(formatParseError(PREFIX, commandName, schema, parsed, fallback ? [fallback.usage] : []));
  }

  try {
    const ctx = await createPrefixContext(message, member, commandName, parsed.kind === 'ok' ? parsed : EMPTY_PARSE);
    if (typeof ctx === 'string') return reply(ctx);

    if (parsed.kind === 'fallback') await fallback!.run(ctx, parsed.rawArgs);
    else await command.run(ctx);
  } catch (error) {
    await reply(userMessageFor(error, commandName, 'Prefix'));
  }
};

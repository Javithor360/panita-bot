import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import type { CommandContext } from '../../core/context';
import { UserError } from '../../core/errors';
import type { ServerEmoji } from '../../features/ask/emojis';
import { MAX_QUESTION_CHARS } from '../../features/ask/guard';
import { mentionedIds, nameMentions } from '../../features/ask/names';
import { buildGalleryMessage } from '../../features/gallery/message';
import { PRE_ACK_REQUEST } from '../../lib/api';
import { getAskService } from '../../services/ask';
import { getRandomPhoto } from '../../services/gallery';
import { findTicketByChannel } from '../../services/tickets';

/**
 * A refusal that comes quickly (a limit, an empty question) is shown only to the member, which a deferred reply can't
 * do; so the reply is deferred only when the answer takes longer than this. A slash command must respond within 3 s.
 */
const DEFER_AFTER_MS = 1500;

const TICKET_REFUSAL = '❌ No respondo preguntas dentro de los tickets. Pregúntame en cualquier otro canal.';

/** Whether the command runs in a ticket channel. When the API can't tell, the answer is not blocked. */
const isTicketChannel = async (ctx: CommandContext): Promise<boolean> => {
  if (!ctx.channel) return false;
  try {
    return (await findTicketByChannel(ctx.channel.id, PRE_ACK_REQUEST)) !== null;
  } catch {
    return false;
  }
};

/** The gallery message with a random photo, or null when there is none or the API fails (the text is sent alone then). */
const randomPhotoMessage = async (userId: string) => {
  try {
    const message = await buildGalleryMessage(await getRandomPhoto(), userId);
    return message.embeds.length > 0 ? message : null;
  } catch (error) {
    console.error('[Ask] Could not get a gallery photo:', error);
    return null;
  }
};

/** The question with the members it mentions written as their names (looked up when they are not cached). */
const withNames = async (ctx: CommandContext, prompt: string): Promise<string> => {
  const names = new Map<string, string>();
  await Promise.all(mentionedIds(prompt).map(async id => {
    const member = ctx.guild.members.cache.get(id) ?? await ctx.guild.members.fetch(id).catch(() => null);
    if (member) names.set(id, member.displayName);
  }));
  return nameMentions(prompt, id => names.get(id));
};

/** The custom emojis of the server that the bot can use (available, and not limited to some roles). */
const usableEmojis = (ctx: CommandContext): ServerEmoji[] =>
  ctx.guild.emojis.cache
    .filter(emoji => emoji.available !== false && !!emoji.name && emoji.roles.cache.size === 0)
    .map(emoji => ({ name: emoji.name!, id: emoji.id, animated: !!emoji.animated }));

const waitFor = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms).unref());

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Pregúntame sobre Panitacraft o charla conmigo.')
    .addStringOption(option =>
      option.setName('prompt')
        .setDescription('Tu pregunta o mensaje.')
        .setRequired(true)
        .setMaxLength(MAX_QUESTION_CHARS),
    ),
  meta: {
    category: CATEGORIES.general,
    description:
      'Haz una pregunta al asistente: resuelve dudas sobre Panitacraft (qué es, la web, cómo unirse) y también puedes charlar con él. '
      + 'También funciona mencionando al bot: `@Panita Bot ask <pregunta>`. Tiene un tiempo de espera entre preguntas y un límite diario.',
    aliases: ['pregunta', 'preguntar'],
  },
  async run(ctx) {
    const prompt = ctx.options.getString('prompt', true);

    let settled = false;
    const answering = (async () => {
      if (await isTicketChannel(ctx)) throw new UserError(TICKET_REFUSAL);
      return getAskService().ask(ctx.user.id, await withNames(ctx, prompt), usableEmojis(ctx));
    })().finally(() => { settled = true; });

    await Promise.race([answering.catch(() => {}), waitFor(DEFER_AFTER_MS)]);
    if (!settled) await ctx.defer();

    const { text, photo } = await answering;
    const gallery = photo ? await randomPhotoMessage(ctx.user.id) : null;

    if (!gallery) return ctx.reply({ content: text, allowedMentions: { parse: [] }, suppressEmbeds: true });
    // The text and the photo go in one message, with the gallery's own buttons (🎲 and 🔗)
    await ctx.reply({ ...gallery, content: text, allowedMentions: { parse: [] } });
  },
});

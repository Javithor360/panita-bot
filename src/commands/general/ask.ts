import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import type { CommandContext } from '../../core/context';
import { UserError } from '../../core/errors';
import { MAX_QUESTION_CHARS } from '../../features/ask/guard';
import { PRE_ACK_REQUEST } from '../../lib/api';
import { getAskService } from '../../services/ask';
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
      return getAskService().ask(ctx.user.id, prompt);
    })().finally(() => { settled = true; });

    await Promise.race([answering.catch(() => {}), waitFor(DEFER_AFTER_MS)]);
    if (!settled) await ctx.defer();

    const answer = await answering;
    await ctx.reply({ content: answer, allowedMentions: { parse: [] }, suppressEmbeds: true });
  },
});

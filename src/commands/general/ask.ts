import { SlashCommandBuilder, type Message } from 'discord.js';
import { CATEGORIES, PREFIX } from '../../config/constants';
import { defineCommand } from '../../core/command';
import type { CommandContext } from '../../core/context';
import { UserError } from '../../core/errors';
import { CHAT_WINDOW_MS, refersToChat, type ChatLine } from '../../features/ask/chatContext';
import { conversations } from '../../features/ask/conversations';
import { asksToPickPerson, MAX_CANDIDATES } from '../../features/ask/pick';
import type { ServerEmoji } from '../../features/ask/emojis';
import { MAX_QUESTION_CHARS } from '../../features/ask/guard';
import { mentionedIds, nameMentions } from '../../features/ask/names';
import { buildGalleryMessage } from '../../features/gallery/message';
import { PRE_ACK_REQUEST } from '../../lib/api';
import { getAskService } from '../../services/ask';
import { getAuthorRandomPhoto, getRandomPhoto } from '../../services/gallery';
import { findTicketByChannel } from '../../services/tickets';

/**
 * A refusal that comes quickly (a limit, an empty question) is shown only to the member, which a deferred reply can't
 * do; so the reply is deferred only when the answer takes longer than this. A slash command must respond within 3 s.
 */
const DEFER_AFTER_MS = 1500;

const TICKET_REFUSAL = 'No respondo preguntas dentro de los tickets. Pregúntame en cualquier otro canal.';

/** Whether the command runs in a ticket channel. When the API can't tell, the answer is not blocked. */
const isTicketChannel = async (ctx: CommandContext): Promise<boolean> => {
  if (!ctx.channel) return false;
  try {
    return (await findTicketByChannel(ctx.channel.id, PRE_ACK_REQUEST)) !== null;
  } catch {
    return false;
  }
};

/**
 * The gallery message with a random photo (of one member when `ign` is given), or null when there is none or the API
 * fails (the text is sent alone then). The member was already checked for a hidden profile when the data was read.
 */
const randomPhotoMessage = async (userId: string, ign: string | null) => {
  try {
    const message = await buildGalleryMessage(ign ? await getAuthorRandomPhoto(ign) : await getRandomPhoto(), userId);
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

const CHAT_FETCH_LIMIT = 10;

/**
 * The messages of the channel the question may be about: the one the member replied to (unless it is an answer of the
 * assistant), and, when the question points at the chat, the recent ones from other people. Without permission to read
 * the channel the answer is simply given without them. The service cleans and limits what is sent.
 */
/** Who counts as "around" for a favorite person: those who wrote in the channel in the last half hour. */
const PEOPLE_WINDOW_MS = 30 * 60_000;
const PEOPLE_FETCH_LIMIT = 30;

/**
 * The people the assistant may pick from when the question asks it to choose a person (a favorite, a least favorite):
 * the others who wrote in the channel lately, and when nobody did, the members who can see the channel. Never the
 * member asking, and never a bot. The service rolls the dice among them.
 */
const peopleFor = async (ctx: CommandContext, question: string): Promise<string[]> => {
  const channel = ctx.channel;
  if (!channel || !asksToPickPerson(question)) return [];

  const asker = ctx.user.id;
  const names = new Map<string, string>();
  try {
    const recent = await channel.messages.fetch(
      ctx.triggerMessageId ? { limit: PEOPLE_FETCH_LIMIT, before: ctx.triggerMessageId } : { limit: PEOPLE_FETCH_LIMIT },
    );
    const now = Date.now();
    for (const message of recent.values()) {
      if (message.author.bot || message.author.id === asker || now - message.createdTimestamp > PEOPLE_WINDOW_MS) continue;
      names.set(message.author.id, message.member?.displayName ?? message.author.globalName ?? message.author.username);
    }
  } catch {
    // No permission to read the channel history: fall back to who can see it
  }

  if (names.size === 0) {
    const viewers = ctx.guild.members.cache.filter(member =>
      !member.user.bot && member.id !== asker && !!channel.permissionsFor(member)?.has('ViewChannel'));
    for (const member of viewers.values()) names.set(member.id, member.displayName);
  }

  // Shuffled, so that the names kept when there are too many are not always the same ones
  return [...names.values()].sort(() => Math.random() - 0.5).slice(0, MAX_CANDIDATES);
};

const chatFor = async (ctx: CommandContext, question: string): Promise<ChatLine[]> => {
  const channel = ctx.channel;
  if (!channel) return [];

  const authorOf = (message: Message) => message.member?.displayName ?? message.author.globalName ?? message.author.username;
  const readable = (message: Message) => !message.author.bot && !!message.content.trim() && !message.content.trim().startsWith(PREFIX);
  const lines: ChatLine[] = [];

  try {
    const repliedId = ctx.referencedMessageId;
    if (repliedId && conversations.recall(repliedId).length === 0) {
      const replied = await channel.messages.fetch(repliedId).catch(() => null);
      if (replied && readable(replied)) lines.push({ author: authorOf(replied), text: replied.content, repliedTo: true });
    }

    if (refersToChat(question)) {
      const recent = await channel.messages.fetch(
        ctx.triggerMessageId ? { limit: CHAT_FETCH_LIMIT, before: ctx.triggerMessageId } : { limit: CHAT_FETCH_LIMIT },
      );
      const now = Date.now();
      const earlier = [...recent.values()]
        .reverse()
        .filter(message => readable(message) && message.id !== repliedId && now - message.createdTimestamp <= CHAT_WINDOW_MS);
      lines.unshift(...earlier.map(message => ({ author: authorOf(message), text: message.content })));
    }
  } catch {
    // No permission to read the channel history: the question is answered without the chat
  }
  return lines;
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

    // A reply to an answer of the assistant brings the exchanges before it; any other message starts a new talk
    const history = conversations.recall(ctx.referencedMessageId);

    let settled = false;
    const answering = (async () => {
      if (await isTicketChannel(ctx)) throw new UserError(TICKET_REFUSAL);
      return getAskService().ask(ctx.user.id, await withNames(ctx, prompt), usableEmojis(ctx), history, await chatFor(ctx, prompt), await peopleFor(ctx, prompt));
    })().finally(() => { settled = true; });

    await Promise.race([answering.catch(() => {}), waitFor(DEFER_AFTER_MS)]);
    if (!settled) await ctx.defer();

    const { text, photo, photoOf, turn } = await answering;
    const gallery = photo ? await randomPhotoMessage(ctx.user.id, photoOf) : null;

    if (gallery) {
      // The text and the photo go in one message, with the gallery's own buttons (🎲 and 🔗)
      await ctx.reply({ ...gallery, content: text, allowedMentions: { parse: [] } });
    } else {
      await ctx.reply({ content: text, allowedMentions: { parse: [] }, suppressEmbeds: true });
    }

    // Anyone replying to this answer in the next ten minutes continues the talk, with the last exchanges as context
    const sent = await ctx.fetchReply().catch(() => null);
    if (sent) conversations.remember(sent.id, [...history, turn]);
  },
});

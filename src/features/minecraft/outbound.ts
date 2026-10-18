import { PREFIX } from '../../config/constants';
import type { EnabledMember } from '../../lib/api/types';
import type { ChannelMap } from './channels';
import { bareCommand } from './bare';
import type { BridgeLink } from './link';
import type { LinkedMedia } from './linkMedia';
import {
  FEATURE_MEDIA,
  FEATURE_REPLY,
  MAX_CHAT_LENGTH,
  MAX_MEDIA,
  MAX_REPLY_AUTHOR,
  MAX_REPLY_TEXT,
  mediaOf,
  withoutControlCharacters,
  type GameChatFrame,
  type MediaSource,
} from './protocol';
import type { RateLimiter } from './rateLimit';

/** The part of a Discord message the bridge reads. */
export interface BridgeMessage {
  author: { bot: boolean; id: string };
  webhookId: string | null;
  channelId: string;
  /** The text with mentions already written as names. */
  cleanContent: string;
  content: string;
  attachments: { size: number; values(): Iterable<MediaSource> };
  stickers: { size: number };
  /** The message this one replies to, when it is a reply. */
  reference: { messageId?: string | null } | null;
  fetchReference(): Promise<ReplyTarget>;
  inGuild(): boolean;
  react(emoji: string): Promise<unknown>;
}

/** The message a reply answers, as far as the bridge reads it. */
export interface ReplyTarget {
  author: { username: string; displayName?: string };
  /** Their nickname in the server; absent for a webhook, whose name is its username. */
  member?: { displayName: string } | null;
  cleanContent: string;
  attachments: { size: number };
  stickers: { size: number };
}

/** Who wrote a message, as people see them: their nickname in the server, else their name; a webhook is called what it is called. */
const nameOf = (target: ReplyTarget): string =>
  withoutControlCharacters(target.member?.displayName ?? target.author.displayName ?? target.author.username).trim().slice(0, MAX_REPLY_AUTHOR);

/** The message a reply answers, written for the game; null when it cannot be fetched or there is nothing of it to show. */
export const replyOf = async (message: Pick<BridgeMessage, 'reference' | 'fetchReference'>): Promise<GameChatFrame['reply'] | null> => {
  if (!message.reference?.messageId) return null;
  try {
    const target = await message.fetchReference();
    const text = toGameText(target).slice(0, MAX_REPLY_TEXT).trim();
    const author = nameOf(target);
    return text && author ? { author, text } : null;
  } catch {
    // A message that was deleted, or that the bot cannot see, is just not shown
    return null;
  }
};

const CUSTOM_EMOJI = /<a?:(\w+):\d+>/g;

/**
 * What a message says, as one line of chat: emojis and attachments written out, newlines gone, not too long. The attachments
 * that go as `media` (`inMedia` of them) are not written out.
 */
export const toGameText = (
  message: Pick<BridgeMessage, 'cleanContent' | 'stickers'> & { attachments: { size: number } },
  inMedia = 0,
): string => {
  const parts = [
    withoutControlCharacters(message.cleanContent.replace(CUSTOM_EMOJI, ':$1:').replace(/\s*\n+\s*/g, ' ')).trim(),
    message.attachments.size > inMedia ? '[adjunto]' : '',
    message.stickers.size > 0 ? '[sticker]' : '',
  ].filter(Boolean);
  const text = parts.join(' ');
  return text.length <= MAX_CHAT_LENGTH ? text : `${text.slice(0, MAX_CHAT_LENGTH - 1)}…`;
};

export interface OutboundDeps {
  link: Pick<BridgeLink, 'connected' | 'send' | 'features'>;
  channels: ChannelMap;
  directory: { byDiscordId(discordId: string): Promise<EnabledMember | undefined> };
  /** The images among the links of a message, at most as many as there is room for. */
  links: (content: string, room: number) => Promise<LinkedMedia>;
  limiter: Pick<RateLimiter, 'take'>;
  logger: Pick<Console, 'error'>;
}

/**
 * Takes what members write in a bridged channel to the Minecraft server. Only linked members are heard: anyone else gets a ❌
 * on their message and nothing else. Commands (`!`, and a bare `playerlist`), bots and webhooks are never bridged, so a message cannot loop.
 */
export const createOutbound = (deps: OutboundDeps) => async (message: BridgeMessage): Promise<void> => {
  if (message.author.bot || message.webhookId || !message.inGuild() || message.content.startsWith(PREFIX) || bareCommand(message.content)) return;
  const channel = deps.channels.chatChannelOf(message.channelId);
  if (!channel || !deps.link.connected) return;

  // Images go as references only to a mod that can show them; any other mod keeps getting [adjunto] in the text
  const announced = deps.link.features.includes(FEATURE_MEDIA);
  const media = announced ? mediaOf(message.attachments.values()) : [];
  const attachedCount = media.length;
  // Links to images are images too, once the ones that were uploaded have had their places
  let cleanContent = message.cleanContent;
  if (announced && message.content.includes('http')) {
    const linked = await deps.links(message.content, MAX_MEDIA - media.length).catch(() => ({ entries: [], consumed: [] }));
    media.push(...linked.entries);
    for (const link of linked.consumed) cleanContent = cleanContent.replace(`<${link}>`, '').replace(link, '');
  }
  const text = toGameText({ ...message, cleanContent }, attachedCount);
  if ((!text && media.length === 0) || !deps.limiter.take(message.author.id)) return;
  const reply = deps.link.features.includes(FEATURE_REPLY) ? await replyOf(message) : null;

  try {
    const member = await deps.directory.byDiscordId(message.author.id);
    if (!member) {
      await message.react('❌').catch(() => {});
      return;
    }
    deps.link.send({ type: 'chat', channel, author: { discordId: member.discord_id, ign: member.ign }, text, ...(media.length > 0 ? { media } : {}), ...(reply ? { reply } : {}) });
  } catch (error) {
    deps.logger.error('[Minecraft] Could not pass a message to the server:', error);
  }
};

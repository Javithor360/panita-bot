import { PREFIX } from '../../config/constants';
import type { EnabledMember } from '../../lib/api/types';
import type { ChannelMap } from './channels';
import type { BridgeLink } from './link';
import { MAX_CHAT_LENGTH, withoutControlCharacters } from './protocol';
import type { RateLimiter } from './rateLimit';

/** The part of a Discord message the bridge reads. */
export interface BridgeMessage {
  author: { bot: boolean; id: string };
  webhookId: string | null;
  channelId: string;
  /** The text with mentions already written as names. */
  cleanContent: string;
  content: string;
  attachments: { size: number };
  stickers: { size: number };
  inGuild(): boolean;
  react(emoji: string): Promise<unknown>;
}

const CUSTOM_EMOJI = /<a?:(\w+):\d+>/g;

/** What a message says, as one line of chat: emojis and attachments written out, newlines gone, not too long. */
export const toGameText = (message: Pick<BridgeMessage, 'cleanContent' | 'attachments' | 'stickers'>): string => {
  const parts = [
    withoutControlCharacters(message.cleanContent.replace(CUSTOM_EMOJI, ':$1:').replace(/\s*\n+\s*/g, ' ')).trim(),
    message.attachments.size > 0 ? '[adjunto]' : '',
    message.stickers.size > 0 ? '[sticker]' : '',
  ].filter(Boolean);
  const text = parts.join(' ');
  return text.length <= MAX_CHAT_LENGTH ? text : `${text.slice(0, MAX_CHAT_LENGTH - 1)}…`;
};

export interface OutboundDeps {
  link: Pick<BridgeLink, 'connected' | 'send'>;
  channels: ChannelMap;
  directory: { byDiscordId(discordId: string): Promise<EnabledMember | undefined> };
  limiter: Pick<RateLimiter, 'take'>;
  logger: Pick<Console, 'error'>;
}

/**
 * Takes what members write in a bridged channel to the Minecraft server. Only linked members are heard: anyone else gets a ❌
 * on their message and nothing else. Commands (`!`), bots and webhooks are never bridged, so a message cannot loop.
 */
export const createOutbound = (deps: OutboundDeps) => async (message: BridgeMessage): Promise<void> => {
  if (message.author.bot || message.webhookId || !message.inGuild() || message.content.startsWith(PREFIX)) return;
  const channel = deps.channels.chatChannelOf(message.channelId);
  if (!channel || !deps.link.connected) return;

  const text = toGameText(message);
  if (!text || !deps.limiter.take(message.author.id)) return;

  try {
    const member = await deps.directory.byDiscordId(message.author.id);
    if (!member) {
      await message.react('❌').catch(() => {});
      return;
    }
    deps.link.send({ type: 'chat', channel, author: { discordId: member.discord_id, ign: member.ign }, text });
  } catch (error) {
    deps.logger.error('[Minecraft] Could not pass a message to the server:', error);
  }
};

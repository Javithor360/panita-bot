import { MessageType } from 'discord.js';

/** What the welcome needs of a message of the server. */
export interface JoinMessage {
  type: MessageType;
  author: { id: string; bot: boolean };
  /** A reply that pings only who `allowedMentions` lists. */
  reply(payload: {
    content?: string;
    stickers?: string[];
    allowedMentions: { parse: []; users?: string[]; repliedUser: false };
  }): Promise<unknown>;
}

export interface WelcomeDeps {
  /** The stickers to pick from, one at random per join. Empty for the text only. */
  stickerIds: readonly string[];
  /** A number in `[0, 1)`; `Math.random` unless a test needs it fixed. */
  random?: () => number;
  logger?: Pick<Console, 'log' | 'error'>;
}

/** The text sent when there is no sticker to send, or when Discord refuses it. It pings only the new member. */
export const welcomeText = (userId: string): string => `👋 ¡Te damos la bienvenida a Panitacraft, <@${userId}>!`;

/**
 * Replies to the system message that Discord posts when someone joins (the one with the "Wave to say hi!" button) with
 * one of Discord's own stickers, picked at random like the button does. A bot cannot press that button, and it is not
 * known whether Discord lets a bot send a standard sticker, so when it is refused (or there are none) a short text is
 * sent instead.
 */
export const createWelcome = ({ stickerIds, random = Math.random, logger = console }: WelcomeDeps) => async (message: JoinMessage): Promise<void> => {
  if (message.type !== MessageType.UserJoin || message.author.bot) return;

  if (stickerIds.length > 0) {
    try {
      const stickerId = stickerIds[Math.min(stickerIds.length - 1, Math.floor(random() * stickerIds.length))];
      await message.reply({ stickers: [stickerId], allowedMentions: { parse: [], repliedUser: false } });
      return;
    } catch (error) {
      logger.error('[Welcome] Could not send the sticker; sending the text instead:', error);
    }
  }

  await message.reply({ content: welcomeText(message.author.id), allowedMentions: { parse: [], users: [message.author.id], repliedUser: false } });
};

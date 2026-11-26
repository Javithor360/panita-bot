import type { Message } from 'discord.js';
import { WELCOME_STICKERS } from '../config/constants';
import { createWelcome } from '../features/welcome/welcome';
import { isHomeGuild } from '../lib/discord';

const welcome = createWelcome({ stickerIds: WELCOME_STICKERS });

/** Greets a new member under Discord's own join message. A failure is logged and never reaches the other listeners. */
export const welcomeEvent = async (message: Message): Promise<void> => {
  if (!message.inGuild() || !isHomeGuild(message.guild)) return;
  try {
    await welcome(message);
  } catch (error) {
    console.error('[Welcome] Could not greet the new member:', error);
  }
};

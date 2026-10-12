import type { Message } from 'discord.js';
import { bridgeMessageHandler } from '../features/minecraft';

/** A message in a channel joined to the Minecraft server. Thin: the bridge decides what to do with it. */
export const bridgeMessageEvent = (message: Message) => {
  void bridgeMessageHandler?.(message);
};

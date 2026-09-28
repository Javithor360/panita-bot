import type { Client } from 'discord.js';
import type { CommandRegistry } from '../core/registry';

export const readyEvent = (client: Client<true>, registry: CommandRegistry) => {
  console.log(`Bot is online! Logged in as ${client.user.tag}`);
  console.log(`[Registry] ${registry.byName.size} commands loaded (${registry.byAlias.size} prefix aliases).`);
};

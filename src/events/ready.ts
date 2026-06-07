import { Client } from 'discord.js';

export const readyEvent = (client: Client<true>) => {
  console.log(`Bot is online! Logged in as ${client.user.tag}`);
};

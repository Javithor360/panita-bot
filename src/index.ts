import { env } from './config/env';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { getRegistry } from './core/registry';
import { installProcessHandlers } from './core/errors';
import { createInteractionHandler } from './handlers/interactionCreate';
import { createMessageHandler } from './handlers/messageCreate';
import { readyEvent } from './events/ready';
import { userUpdateEvent } from './events/userUpdate';
import { guildMemberAddEvent } from './events/guildMemberAdd';
import { guildMemberUpdateEvent } from './events/guildMemberUpdate';
import { roleDeleteEvent } from './events/roleEvents';
import { api, verifyApiAccess } from './lib/api';
import { startWebSync } from './services/webSync';
import { keepAlive } from './server';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

installProcessHandlers(client);

const registry = getRegistry();

client.once(Events.ClientReady, c => {
  readyEvent(c, registry);
  startWebSync(client);
  keepAlive();
});

client.on(Events.UserUpdate, userUpdateEvent);
client.on(Events.GuildMemberAdd, guildMemberAddEvent);
client.on(Events.GuildMemberUpdate, guildMemberUpdateEvent);
client.on(Events.GuildRoleDelete, roleDeleteEvent);
client.on(Events.InteractionCreate, createInteractionHandler(registry));
client.on(Events.MessageCreate, createMessageHandler(registry));

const start = async () => {
  if (!(await verifyApiAccess(api))) process.exit(1);
  await client.login(env.DISCORD_TOKEN);
};

start().catch(error => {
  console.error('[Client] Login failed:', error);
  process.exit(1);
});

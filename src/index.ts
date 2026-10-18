import { env } from './config/env';
import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { getRegistry } from './core/registry';
import { installProcessHandlers } from './core/errors';
import { createInteractionHandler } from './handlers/interactionCreate';
import { createMessageHandler } from './handlers/messageCreate';
import { createDirectMessageHandler } from './events/dmMessage';
import { readyEvent } from './events/ready';
import { userUpdateEvent } from './events/userUpdate';
import { guildMemberAddEvent } from './events/guildMemberAdd';
import { guildMemberRemoveEvent } from './events/guildMemberRemove';
import { guildMemberUpdateEvent } from './events/guildMemberUpdate';
import { roleDeleteEvent } from './events/roleEvents';
import { api, verifyApiAccess } from './lib/api';
import { startWebSync } from './services/webSync';
import { startPasswordResetSync } from './services/passwordResetSync';
import { startBirthdayScheduler } from './services/birthdayScheduler';
import { reconcileLeftMembers } from './services/leftMembers';
import { keepAlive } from './server';
import { startBridge } from './features/minecraft';
import { bridgeMessageEvent } from './events/bridgeMessage';
import { galleryPostEvent, galleryReactionEvent } from './events/galleryUpload';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    // Members confirm sign-in codes by DM
    GatewayIntentBits.DirectMessages,
    // The author's own 👍 on a photo in the gallery channel starts the quick upload
    GatewayIntentBits.GuildMessageReactions,
  ],
  // DM channels reach the bot as partials, and so do reactions on messages from before it started
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
});

installProcessHandlers(client);

const registry = getRegistry();

client.once(Events.ClientReady, c => {
  readyEvent(c, registry);
  startWebSync(client);
  startPasswordResetSync(client);
  startBirthdayScheduler(client);
  const web = keepAlive();
  startBridge(web.server, web.app, c);

  // Accounts of members who left while the bot was offline; it never blocks or breaks the start
  const home = env.GUILD_ID ? c.guilds.cache.get(env.GUILD_ID) : undefined;
  if (home) void reconcileLeftMembers(home);
  else console.error('[Reconcile] GUILD_ID is not set or the guild was not found; skipping.');
});

client.on(Events.UserUpdate, userUpdateEvent);
client.on(Events.GuildMemberAdd, guildMemberAddEvent);
client.on(Events.GuildMemberRemove, guildMemberRemoveEvent);
client.on(Events.GuildMemberUpdate, guildMemberUpdateEvent);
client.on(Events.GuildRoleDelete, roleDeleteEvent);
client.on(Events.InteractionCreate, createInteractionHandler(registry));
client.on(Events.MessageCreate, createMessageHandler(registry));
client.on(Events.MessageCreate, createDirectMessageHandler());
client.on(Events.MessageCreate, bridgeMessageEvent);
client.on(Events.MessageCreate, galleryPostEvent);
client.on(Events.MessageReactionAdd, galleryReactionEvent);

const start = async () => {
  if (!(await verifyApiAccess(api))) process.exit(1);
  await client.login(env.DISCORD_TOKEN);
};

start().catch(error => {
  console.error('[Client] Login failed:', error);
  process.exit(1);
});

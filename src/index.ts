import { Client, GatewayIntentBits } from 'discord.js';
import { config } from 'dotenv';
import { readyEvent } from './events/ready';
import { userUpdateEvent } from './events/userUpdate';
import { guildMemberAddEvent } from './events/guildMemberAdd';
import { guildMemberUpdateEvent } from './events/guildMemberUpdate';
import { roleDeleteEvent } from './events/roleEvents';
import { execute as executeSystemSync } from './commands/systemsync';
import { initPostgresSync } from './events/postgresSync';
import { keepAlive } from './server';

// Load environment variables
config();

// Initialize Discord Client with necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

// Register Events
client.once('ready', (c) => {
  readyEvent(c);
  initPostgresSync(client);
  keepAlive(); // Initialize web server to keep the bot alive
});
client.on('userUpdate', (oldUser, newUser) => userUpdateEvent(oldUser, newUser));
client.on('guildMemberAdd', (member) => guildMemberAddEvent(member));
client.on('guildMemberUpdate', (oldMember, newMember) => guildMemberUpdateEvent(oldMember, newMember));
client.on('roleDelete', (role) => roleDeleteEvent(role));

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'systemsync') {
    await executeSystemSync(interaction);
  }
});

// Start the bot
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("No DISCORD_TOKEN found in .env file");
  process.exit(1);
}

client.login(token).catch(console.error);

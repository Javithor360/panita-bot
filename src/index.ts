import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { readyEvent } from './events/ready';
import { userUpdateEvent } from './events/userUpdate';
import { guildMemberAddEvent } from './events/guildMemberAdd';
import { guildMemberUpdateEvent } from './events/guildMemberUpdate';
import { roleDeleteEvent } from './events/roleEvents';
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
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Setup dynamic command registry
const commands = new Collection<string, any>();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    commands.set(command.data.name, command);
  }
}

// Register Events
client.once('ready', (c) => {
  readyEvent(c);
  initPostgresSync(client);
  keepAlive(); // Initialize web server to keep Render awake
});
client.on('userUpdate', (oldUser, newUser) => userUpdateEvent(oldUser, newUser));
client.on('guildMemberAdd', (member) => guildMemberAddEvent(member));
client.on('guildMemberUpdate', (oldMember, newMember) => guildMemberUpdateEvent(oldMember, newMember));
client.on('roleDelete', (role) => roleDeleteEvent(role));

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
  }
});

// Text commands listener
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift()?.toLowerCase();
  
  if (!commandName) return;

  const command = commands.get(commandName);
  if (!command) return;

  // Execute text-based command if supported
  if (command.executeText) {
    try {
      await command.executeText(message, args);
    } catch (error) {
      console.error(error);
      await message.reply('There was an error trying to execute that command!');
    }
  }
});

// Start the bot
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("No DISCORD_TOKEN found in .env file");
  process.exit(1);
}

client.login(token).catch(console.error);

import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { config } from 'dotenv';
import { prisma } from './lib/prisma';
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
    
    // Register aliases in the collection
    if (command.metadata?.aliases && Array.isArray(command.metadata.aliases)) {
      for (const alias of command.metadata.aliases) {
        commands.set(alias, command);
      }
    }
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

  if (command.metadata?.devOnly && interaction.user.id !== process.env.DEVELOPER_ID) {
    return interaction.reply({ content: '❌ No estás autorizado para usar este comando.', ephemeral: true });
  }

  if (command.metadata?.staffOnly) {
    const staffRoleId = process.env.STAFF_ROLE_ID;
    const member = interaction.member as import('discord.js').GuildMember;
    if (!staffRoleId || !member?.roles.cache.has(staffRoleId)) {
      return interaction.reply({ content: '❌ No tienes permisos de Staff para usar este comando.', ephemeral: true });
    }
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '¡Hubo un error al ejecutar este comando!', ephemeral: true });
    } else {
      await interaction.reply({ content: '¡Hubo un error al ejecutar este comando!', ephemeral: true });
    }
  }
});

// UI Component interactions listener (Buttons, Modals, Select Menus)
client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    // We dynamically route the button based on its prefix or origin
    // For now, we know the activate button belongs to the 'register' command
    if (interaction.customId.startsWith('btn_activate')) {
      const command = commands.get('register');
      if (command && command.executeButton) {
        await command.executeButton(interaction);
      }
    }
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('modal_activate')) {
      const command = commands.get('register');
      if (command && command.executeModal) {
        await command.executeModal(interaction);
      }
    }
  } else if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('select_skin')) {
      const command = commands.get('skin');
      if (command && command.executeStringSelect) {
        await command.executeStringSelect(interaction);
      }
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

  if (command.metadata?.slashOnly) {
    return message.reply('❌ Este comando es interactivo y solo se puede usar como **Slash Command** (ejemplo: `/' + commandName + '`).');
  }

  if (command.metadata?.devOnly && message.author.id !== process.env.DEVELOPER_ID) {
    return message.reply('❌ No estás autorizado para usar este comando.');
  }

  if (command.metadata?.staffOnly) {
    const staffRoleId = process.env.STAFF_ROLE_ID;
    if (!staffRoleId || !message.member?.roles.cache.has(staffRoleId)) {
      return message.reply('❌ No tienes permisos de Staff para usar este comando.');
    }
  }

  // Create an adapter to mimic ChatInputCommandInteraction for simple text commands
  if (!command.metadata?.slashOnly && command.execute) {
    let sentMessage: import('discord.js').Message | null = null;

    const interactionAdapter = {
      isChatInputCommand: () => true,
      user: message.author,
      member: message.member,
      guild: message.guild,
      client: message.client,
      createdTimestamp: message.createdTimestamp,
      options: {
        getSubcommand: () => {
          // Si el primer argumento coincide con un subcomando esperado, lo devolvemos
          return args[0]?.toLowerCase() || null;
        },
        getString: (name?: string) => {
          // Adapter básico para parsear los argumentos
          if (name === 'state' || name === 'text') {
            return args.slice(1).join(' ') || null;
          }
          if (name === 'comando') {
            return args[0] || null;
          }
          if (args.length > 1) {
            return args.slice(1).join(' ') || null;
          }
          return args[0] || null;
        },
      },
      deferReply: async () => { /* No-op for text commands */ },
      reply: async (opts: any) => {
        sentMessage = await message.reply(opts);
        return sentMessage;
      },
      fetchReply: async () => sentMessage,
      editReply: async (opts: any) => {
        if (sentMessage) return await sentMessage.edit(opts);
        return await message.reply(opts);
      }
    };

    try {
      await command.execute(interactionAdapter as unknown as import('discord.js').ChatInputCommandInteraction);
    } catch (error) {
      console.error('[Adapter Error]', error);
      await message.reply('¡Ocurrió un error al intentar ejecutar ese comando!');
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

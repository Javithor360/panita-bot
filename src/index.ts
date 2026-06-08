import { Client, GatewayIntentBits, Collection, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ModalSubmitInteraction } from 'discord.js';
import { config } from 'dotenv';
import bcrypt from 'bcryptjs';
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
    
    // Bind aliases to the same command
    if (command.aliases && Array.isArray(command.aliases)) {
      for (const alias of command.aliases) {
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

// Button interactions listener
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'btn_activate_account') {
    const modal = new ModalBuilder()
      .setCustomId('modal_activate_account')
      .setTitle('Activación de Cuenta');

    const ignInput = new TextInputBuilder()
      .setCustomId('input_ign')
      .setLabel('IGN de Minecraft')
      .setPlaceholder('Ej: Steve')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(16);

    const passwordInput = new TextInputBuilder()
      .setCustomId('input_password')
      .setLabel('Contraseña')
      .setPlaceholder('Debe tener al menos 6 caracteres')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(6)
      .setMaxLength(32);

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(ignInput);
    const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(passwordInput);

    modal.addComponents(firstActionRow, secondActionRow);

    await interaction.showModal(modal);
  }
});

// Modal submit listener
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  if (interaction.customId === 'modal_activate_account') {
    const ign = interaction.fields.getTextInputValue('input_ign');
    const password = interaction.fields.getTextInputValue('input_password');
    const discordId = interaction.user.id;

    try {
      // Defer reply immediately since hashing might take a bit
      await interaction.deferReply({ ephemeral: true });

      const hashedPassword = bcrypt.hashSync(password, 10);

      await prisma.user.update({
        where: { discord_id: discordId },
        data: {
          ign: ign,
          password: hashedPassword,
          enabled: true
        }
      });

      await interaction.editReply({
        content: `🎉 **¡Éxito!** Tu cuenta ha sido activada con el IGN \`${ign}\`.\n\nYa puedes iniciar sesión en: https://panita.vercel.app/login`
      });
    } catch (error) {
      console.error('[Activation Error]', error);
      await interaction.editReply('Ocurrió un error al activar tu cuenta. Por favor inténtalo de nuevo más tarde.');
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

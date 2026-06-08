import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, Message, Client } from 'discord.js';
import fs from 'fs';
import path from 'path';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Muestra la lista de comandos o información sobre uno en específico.')
  .addStringOption(option => 
    option.setName('comando')
      .setDescription('El nombre del comando del que quieres ver más detalles.')
      .setRequired(false)
  );

export const metadata = {
  aliases: ['ayuda', 'comandos'],
  category: 'General',
  description: 'Muestra la lista de todos los comandos disponibles o ayuda sobre uno en específico.',
  usage: 'help [comando]',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

// Helper function to build the embed logic
const buildHelpEmbed = (userId: string, client: Client, commandName?: string) => {
  const embed = new EmbedBuilder().setColor('#5865F2');

  if (commandName) {
    // Dynamically find the specific command
    const commandsPath = __dirname;
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
    let command: any = null;

    for (const file of commandFiles) {
      const cmd = require(path.join(commandsPath, file));
      if (cmd.data && cmd.execute) {
        if (cmd.data.name === commandName.toLowerCase() || (cmd.metadata?.aliases && cmd.metadata.aliases.includes(commandName.toLowerCase()))) {
          command = cmd;
          break;
        }
      }
    }

    if (!command) {
      embed.setColor('#ED4245')
        .setTitle('❌ Comando no encontrado')
        .setDescription(`No se encontró ningún comando con el nombre \`${commandName}\`.`);
      return embed;
    }

    const aliasesText = command.metadata?.aliases && command.metadata.aliases.length > 0 
      ? command.metadata.aliases.map((a: string) => `\`${a}\``).join(', ') 
      : 'Ninguno';

    const supportedModes = command.metadata?.slashOnly ? 'Solo Slash Commands (`/`)' : 'Slash Commands (`/`) y Prefijo (`!`)';
    const devOnlyText = command.metadata?.devOnly ? '🔒 Solo Desarrollador' : 'Cualquier usuario';

    embed.setTitle(`ℹ️ Información del Comando: ${command.data.name}`)
      .addFields(
        { name: 'Descripción', value: command.metadata?.description || command.data.description || 'Sin descripción.' },
        { name: 'Categoría', value: command.metadata?.category || 'Sin categoría', inline: true },
        { name: 'Permisos', value: devOnlyText, inline: true },
        { name: 'Modos de uso', value: supportedModes, inline: false },
        { name: 'Alias', value: aliasesText },
        { name: 'Uso Estructurado', value: `\`/${command.metadata?.usage || command.data.name}\`` }
      )
      .setFooter({ text: 'Sintaxis: <obligatorio> | [opcional]' });

  } else {
    // Global Help Menu
    const categories: Record<string, string[]> = {};
    const processedCommands = new Set<string>();

    const commandsPath = __dirname;
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));

    for (const file of commandFiles) {
      const cmd = require(path.join(commandsPath, file));
      if (cmd.data && cmd.execute) {
        if (processedCommands.has(cmd.data.name)) continue;
        processedCommands.add(cmd.data.name);

        const cat = cmd.metadata?.category || 'Sin Categoría';
        if (!categories[cat]) categories[cat] = [];

        categories[cat].push(`\`${cmd.data.name}\``);
      }
    }

    embed.setTitle('<:llamushroom:1513402349920714852> Lista de Comandos')
      .setDescription('Puedes ejecutarlos usando **Slash Commands** (`/comando`) o mediante el **Prefijo Clásico** (`!comando`)')
      .setFooter({ text: 'Para más detalles, utiliza /help [comando] | Sintaxis: <obligatorio> - [opcional]' });

    if (client.user) {
      embed.setThumbnail(client.user.displayAvatarURL());
    }

    for (const [catName, cmdList] of Object.entries(categories)) {
      // Hide the developer category unless the user is the developer
      if (catName === 'Desarrollador' && userId !== '409529980469641217') {
        continue;
      }
      
      embed.addFields({ name: `📁 ${catName}`, value: cmdList.join(', ') });
    }
  }

  return embed;
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const commandName = interaction.options.getString('comando');
  const embed = buildHelpEmbed(interaction.user.id, interaction.client, commandName ?? undefined);
  await interaction.reply({ embeds: [embed] });
};

import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, Message } from 'discord.js';
import { commands } from '../index';

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
  devOnly: false
};

// Helper function to build the embed logic
const buildHelpEmbed = (commandName?: string) => {
  const embed = new EmbedBuilder().setColor('#5865F2');

  if (commandName) {
    const command = commands.get(commandName.toLowerCase());

    if (!command) {
      embed.setColor('#ED4245')
        .setTitle('❌ Comando no encontrado')
        .setDescription(`No se encontró ningún comando llamado \`${commandName}\`.`);
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
        { name: 'Modos de uso', value: supportedModes, inline: true },
        { name: 'Alias', value: aliasesText },
        { name: 'Uso Estructurado', value: `\`/${command.metadata?.usage || command.data.name}\`` }
      )
      .setFooter({ text: 'Sintaxis: <obligatorio> | [opcional]' });

  } else {
    // Global Help Menu
    const categories: Record<string, string[]> = {};

    // Use a Set to track processed commands to avoid listing aliases as distinct commands
    const processedCommands = new Set<string>();

    commands.forEach((cmd, name) => {
      // Only process the main command name, not the aliases
      if (processedCommands.has(cmd.data.name)) return;
      processedCommands.add(cmd.data.name);

      const cat = cmd.metadata?.category || 'Sin Categoría';
      if (!categories[cat]) categories[cat] = [];

      let item = `**/${cmd.data.name}** - ${cmd.metadata?.description || cmd.data.description}`;
      if (cmd.metadata?.devOnly) {
        item += ' *(Restringido)*';
      }
      categories[cat].push(item);
    });

    embed.setTitle('📚 Lista de Comandos')
      .setDescription('Aquí tienes la lista de todos los comandos disponibles. Puedes ejecutarlos usando **Slash Commands** (`/comando`) o mediante el **Prefijo Clásico** (`!comando`), a menos que se indique lo contrario.')
      .setFooter({ text: 'Usa /help [comando] para ver detalles. Sintaxis: <obligatorio> | [opcional]' });

    for (const [catName, cmdList] of Object.entries(categories)) {
      embed.addFields({ name: `📁 ${catName}`, value: cmdList.join('\n') });
    }
  }

  return embed;
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const commandName = interaction.options.getString('comando');
  const embed = buildHelpEmbed(commandName ?? undefined);
  await interaction.reply({ embeds: [embed] });
};

export const executeText = async (message: Message, args: string[]) => {
  const commandName = args[0];
  const embed = buildHelpEmbed(commandName);
  await message.reply({ embeds: [embed] });
};

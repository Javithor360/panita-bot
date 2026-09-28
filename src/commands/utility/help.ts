import { EmbedBuilder, SlashCommandBuilder, type Client, type GuildMember } from 'discord.js';
import { CATEGORIES, CATEGORY_ORDER, COLORS, EMOJIS, PREFIX } from '../../config/constants';
import { canAccess } from '../../core/access';
import { defineCommand, type Access } from '../../core/command';
import { getRegistry, type CommandInfo } from '../../core/registry';

const buildCommandEmbed = (command: CommandInfo | undefined, query: string) => {
  const embed = new EmbedBuilder().setColor(COLORS.blurple);

  if (!command) {
    return embed.setColor(COLORS.error)
      .setTitle('❌ Comando no encontrado')
      .setDescription(`No se encontró ningún comando con el nombre \`${query}\`.`);
  }

  const aliasesText = command.aliases.length > 0 ? command.aliases.map(a => `\`${PREFIX}${a}\``).join(', ') : 'Ninguno';
  const supportedModes = command.slashOnly ? 'Solo Slash Commands (`/`)' : 'Slash Commands (`/`) y Prefijo (`!`)';
  const slashUsage = command.usage.filter(u => !command.prefixOnlyUsage.includes(u)).map(u => `\`/${u}\``);
  const prefixUsage = command.usage.map(u => `\`${PREFIX}${u}\``);

  embed.setTitle(`ℹ️ Información del Comando: ${command.name}`)
    .addFields(
      { name: 'Descripción', value: command.description || 'Sin descripción.' },
      { name: 'Categoría', value: command.category, inline: true },
      { name: 'Permisos', value: ACCESS_LABELS[command.access], inline: true },
      { name: 'Modos de uso', value: supportedModes, inline: false },
      { name: 'Alias (solo con prefijo `!`)', value: aliasesText },
    );

  if (slashUsage.length > 0) embed.addFields({ name: 'Uso con Slash (`/`)', value: slashUsage.join('\n') });
  if (!command.slashOnly) embed.addFields({ name: 'Uso con Prefijo (`!`)', value: prefixUsage.join('\n') });

  return embed.setFooter({ text: 'Sintaxis: <obligatorio> | [opcional] | [--bandera]' });
};

const ACCESS_LABELS: Record<Access, string> = {
  everyone: 'Cualquier usuario',
  staff: '🛡️ Solo Staff',
  developer: '🔒 Solo Desarrollador',
};

const buildOverviewEmbed = (member: GuildMember, client: Client<true>) => {
  // Only list what this member can actually run
  const categories: Record<string, string[]> = {};
  for (const command of getRegistry().info()) {
    if (!canAccess(command.access, member)) continue;
    (categories[command.category] ??= []).push(`\`${command.name}\``);
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.blurple)
    .setTitle(`${EMOJIS.llamushroom} Lista de Comandos`)
    .setDescription('Puedes ejecutarlos usando **Slash Commands** (`/comando`) o mediante el **Prefijo Clásico** (`!comando`)')
    .setThumbnail(client.user.displayAvatarURL())
    .setFooter({ text: 'Para más detalles, utiliza /help [comando] | Sintaxis: <obligatorio> - [opcional]' });

  // Known categories first (in order), then any other category
  const ordered = [
    ...CATEGORY_ORDER.filter(c => categories[c]),
    ...Object.keys(categories).filter(c => !(CATEGORY_ORDER as readonly string[]).includes(c)),
  ];
  for (const category of ordered) {
    embed.addFields({ name: `📁 ${category}`, value: categories[category].join(', ') });
  }

  return embed;
};

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Muestra la lista de comandos o información sobre uno en específico.')
    .addStringOption(option =>
      option.setName('comando')
        .setDescription('El nombre del comando del que quieres ver más detalles.')
        .setRequired(false),
    ),
  meta: {
    category: CATEGORIES.utility,
    description: 'Muestra la lista de todos los comandos disponibles o ayuda sobre uno en específico.',
    aliases: ['ayuda'],
  },
  async run(ctx) {
    const query = ctx.options.getString('comando');
    const embed = query
      ? buildCommandEmbed(getRegistry().findInfo(query), query)
      : buildOverviewEmbed(ctx.member, ctx.client);
    await ctx.reply({ embeds: [embed] });
  },
});

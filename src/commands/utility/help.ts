import { EmbedBuilder, SlashCommandBuilder, type Client, type GuildMember } from 'discord.js';
import { CATEGORIES, COLORS, EMOJIS } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { getRegistry, type CommandInfo } from '../../core/registry';
import { isDeveloper } from '../../lib/discord';
import { env } from '../../config/env';

const buildCommandEmbed = (command: CommandInfo | undefined, query: string) => {
  const embed = new EmbedBuilder().setColor(COLORS.blurple);

  if (!command) {
    return embed.setColor(COLORS.error)
      .setTitle('❌ Comando no encontrado')
      .setDescription(`No se encontró ningún comando con el nombre \`${query}\`.`);
  }

  const aliasesText = command.aliases.length > 0 ? command.aliases.map(a => `\`${a}\``).join(', ') : 'Ninguno';
  const supportedModes = command.slashOnly ? 'Solo Slash Commands (`/`)' : 'Slash Commands (`/`) y Prefijo (`!`)';
  const devOnlyText = command.access === 'developer' ? '🔒 Solo Desarrollador' : 'Cualquier usuario';

  return embed.setTitle(`ℹ️ Información del Comando: ${command.name}`)
    .addFields(
      { name: 'Descripción', value: command.description || 'Sin descripción.' },
      { name: 'Categoría', value: command.category, inline: true },
      { name: 'Permisos', value: devOnlyText, inline: true },
      { name: 'Modos de uso', value: supportedModes, inline: false },
      { name: 'Alias', value: aliasesText },
      { name: 'Uso Estructurado', value: command.usage.map(u => `\`/${u}\``).join('\n') },
    )
    .setFooter({ text: 'Sintaxis: <obligatorio> | [opcional]' });
};

const ORDERED_CATEGORIES = ['General', 'Utilidad', 'Diversión', 'Moderacion', 'Tickets', 'Desarrollador'];

const buildOverviewEmbed = (member: GuildMember, client: Client<true>) => {
  const categories: Record<string, string[]> = {};
  for (const command of getRegistry().info()) {
    (categories[command.category] ??= []).push(`\`${command.name}\``);
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.blurple)
    .setTitle(`${EMOJIS.llamushroom} Lista de Comandos`)
    .setDescription('Puedes ejecutarlos usando **Slash Commands** (`/comando`) o mediante el **Prefijo Clásico** (`!comando`)')
    .setThumbnail(client.user.displayAvatarURL())
    .setFooter({ text: 'Para más detalles, utiliza /help [comando] | Sintaxis: <obligatorio> - [opcional]' });

  for (const category of ORDERED_CATEGORIES) {
    if (!categories[category]?.length) continue;
    if ((category === 'Moderacion' || category === 'Tickets') && !member.roles.cache.has(env.STAFF_ROLE_ID)) continue;
    if (category === 'Desarrollador' && !isDeveloper(member.id)) continue;
    embed.addFields({ name: `📁 ${category}`, value: categories[category].join(', ') });
  }

  // Append any unlisted categories to the bottom
  for (const [category, names] of Object.entries(categories)) {
    if (ORDERED_CATEGORIES.includes(category) || names.length === 0) continue;
    embed.addFields({ name: `📁 ${category}`, value: names.join(', ') });
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

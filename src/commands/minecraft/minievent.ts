import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, COLORS } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { minieventsData } from '../../data/minievents';
import { renderCatalogList, tezzlarAuthor } from '../../lib/embeds';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('minievent')
    .setDescription('Información sobre los minieventos de Tezzlar')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('ID del minievento o "list" para ver todos')
        .setRequired(true),
    ),
  meta: {
    category: CATEGORIES.minecraft,
    description: 'Muestra información detallada sobre los minieventos aleatorios.',
    aliases: ['minieventos', 'minievents', 'me'],
  },
  async run(ctx) {
    const id = ctx.options.getString('id', true).toLowerCase();

    if (id === 'list') {
      const embed = new EmbedBuilder()
        .setAuthor(tezzlarAuthor('Minieventos de Tezzlar'))
        .setTitle('Lista de Minieventos Disponibles')
        .setDescription('Estos son todos los eventos aleatorios que pueden ocurrir repentinamente. Usa `!minievent <id>` para ver más detalles sobre uno en específico.')
        .setColor(COLORS.dark)
        .addFields({
          name: 'EVENTOS 🎲',
          value: renderCatalogList(Object.values(minieventsData).map(e => ({ label: e.name, id: e.id }))),
        });
      return ctx.reply({ embeds: [embed] });
    }

    const event = minieventsData[id];
    if (!event) {
      return ctx.reply({
        content: `❌ No se encontró ningún minievento con el ID \`${id}\`. Usa \`!minievent list\` para ver los disponibles.`,
        ephemeral: true,
      });
    }

    const effects = event.effects.map(effect => `⠀\\\\- ${effect}`).join('\n');
    const embed = new EmbedBuilder()
      .setAuthor(tezzlarAuthor('Minievento Aleatorio'))
      .setTitle(event.name)
      .setDescription(`*${event.description}*`)
      .setColor(event.color)
      .addFields(
        { name: 'DURACIÓN ⏱️', value: `>>> **➔ Tiempo activo:**\n${event.duration}` },
        { name: 'EFECTOS ⚡', value: `>>> **➔ Consecuencias:**\n${effects}` },
      );

    await ctx.reply({ embeds: [embed] });
  },
});

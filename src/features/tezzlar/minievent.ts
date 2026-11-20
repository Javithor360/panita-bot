import { EmbedBuilder } from 'discord.js';
import { COLORS } from '../../config/constants';
import { minieventsData } from '../../data/minievents';
import { renderCatalogList, tezzlarAuthor } from '../../lib/embeds';
import { fail } from '../../lib/voice';
import type { CommandContext } from '../../core/context';

export const run = async (ctx: CommandContext): Promise<void> => {
  const id = ctx.options.getString('id', true).toLowerCase();

  if (id === 'list') {
    const embed = new EmbedBuilder()
      .setAuthor(tezzlarAuthor('Minieventos de Tezzlar'))
      .setTitle('Lista de Minieventos Disponibles')
      .setDescription('Estos son todos los eventos aleatorios que pueden ocurrir repentinamente. Usa `!tz minievent <id>` para ver más detalles sobre uno en específico.')
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
      content: fail(ctx.member, `no se encontró ningún minievento con el ID \`${id}\`. Usa \`!tz minievent list\` para ver los disponibles.`),
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
};

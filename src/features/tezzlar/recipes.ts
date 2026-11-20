import { EmbedBuilder } from 'discord.js';
import { COLORS } from '../../config/constants';
import { recipesData } from '../../data/recipes';
import { renderCatalogList, tezzlarAuthor } from '../../lib/embeds';
import { fail } from '../../lib/voice';
import type { CommandContext } from '../../core/context';

export const run = async (ctx: CommandContext): Promise<void> => {
  const id = ctx.options.getString('id', true).toLowerCase();

  if (id === 'list') {
    const embed = new EmbedBuilder()
      .setAuthor(tezzlarAuthor('Recetario de Tezzlar'))
      .setTitle('Lista de Categorías de Crafteo')
      .setDescription('Estos son los diferentes tomos de crafteos y recetas modificadas. Usa `!tz recipes <id>` para ver los detalles y las imágenes guía de cada categoría.')
      .setColor(COLORS.dark)
      .addFields({
        name: 'RECETAS DISPONIBLES 📚',
        value: renderCatalogList(Object.values(recipesData).map(r => ({ label: r.title, id: r.id }))),
      });
    return ctx.reply({ embeds: [embed] });
  }

  const recipe = recipesData[id];
  if (!recipe) {
    return ctx.reply({
      content: fail(ctx.member, `no se encontró ninguna receta con el ID \`${id}\`. Usa \`!tz recipes list\` para ver las disponibles.`),
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setAuthor(tezzlarAuthor('Recetario de Tezzlar'))
    .setTitle(recipe.title)
    .setDescription(recipe.description)
    .setImage(recipe.imageUrl)
    .setColor(recipe.color);

  await ctx.reply({ embeds: [embed] });
};

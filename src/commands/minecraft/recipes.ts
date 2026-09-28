import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, COLORS } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { recipesData } from '../../data/recipes';
import { renderCatalogList, tezzlarAuthor } from '../../lib/embeds';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('recipes')
    .setDescription('Muestra los crafteos y recetas especiales de Tezzlar')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('ID de la receta o "list" para ver todas')
        .setRequired(true),
    ),
  meta: {
    category: CATEGORIES.minecraft,
    description: 'Muestra información e imágenes sobre las recetas y crafteos custom.',
    aliases: ['recetas', 'crafteos', 'crafts'],
  },
  async run(ctx) {
    const id = ctx.options.getString('id', true).toLowerCase();

    if (id === 'list') {
      const embed = new EmbedBuilder()
        .setAuthor(tezzlarAuthor('Recetario de Tezzlar'))
        .setTitle('Lista de Categorías de Crafteo')
        .setDescription('Estos son los diferentes tomos de crafteos y recetas modificadas. Usa `!recipes <id>` para ver los detalles y las imágenes guía de cada categoría.')
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
        content: `❌ No se encontró ninguna receta con el ID \`${id}\`. Usa \`!recipes list\` para ver las disponibles.`,
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
  },
});

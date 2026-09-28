import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { customFoods, vanillaFoods, type CustomFood, type VanillaFood } from '../../data/food';
import { tezzlarAuthor } from '../../lib/embeds';

export const renderVanillaFoods = (foods: VanillaFood[]) =>
  foods
    .map(f => `**◈ ${f.name}:** +${f.hunger} 🍗 | +${f.saturation} Sat.${f.effect ? ` *(${f.effect})*` : ''}`)
    .join('\n');

export const renderCustomFoods = (foods: CustomFood[]) =>
  foods
    .map(f => [`**◈ ${f.name}:**`, ...f.details.map(d => `⠀\\- ${d}`)].join('\n'))
    .join('\n\n');

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('food')
    .setDescription('Muestra la información del rebalanceo de comidas en Tezzlar III.'),
  meta: {
    category: CATEGORIES.minecraft,
    description: 'Muestra los nuevos valores de nutrición y los efectos especiales de las comidas.',
    aliases: ['comida', 'foods', 'comidas'],
  },
  async run(ctx) {
    const embed = new EmbedBuilder()
      .setAuthor(tezzlarAuthor('Rebalanceo Gastronómico'))
      .setTitle('Menú Nutricional de Tezzlar')
      .setDescription(
        '>>> La supervivencia requiere buena alimentación. Varias comidas clásicas han sido mejoradas drásticamente y se han introducido nuevos manjares con efectos únicos.' +
        `\n\n**COMIDAS CLÁSICAS MEJORADAS 🍎**\n${renderVanillaFoods(vanillaFoods)}` +
        `\n\n**PLATILLOS ESPECIALES ✨**\n${renderCustomFoods(customFoods)}`,
      )
      .setColor(0xe67e22)
      .setFooter({ text: 'Nota: Los efectos especiales aplican desde el Día 2, y los bufos de curación/saturación desde el Día 15.' });

    await ctx.reply({ embeds: [embed] });
  },
});

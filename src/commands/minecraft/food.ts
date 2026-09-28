import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { customFoods, vanillaFoods, type CustomFood, type VanillaFood } from '../../data/food';

export const data = new SlashCommandBuilder()
  .setName('food')
  .setDescription('Muestra la información del rebalanceo de comidas en Tezzlar III.');

export const metadata = {
  aliases: ['comida', 'foods', 'comidas'],
  category: 'Minecraft',
  description: 'Muestra los nuevos valores de nutrición y los efectos especiales de las comidas.',
  usage: 'food',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const renderVanillaFoods = (foods: VanillaFood[]) =>
  foods
    .map(f => `**◈ ${f.name}:** +${f.hunger} 🍗 | +${f.saturation} Sat.${f.effect ? ` *(${f.effect})*` : ''}`)
    .join('\n');

export const renderCustomFoods = (foods: CustomFood[]) =>
  foods
    .map(f => [`**◈ ${f.name}:**`, ...f.details.map(d => `⠀\\- ${d}`)].join('\n'))
    .join('\n\n');

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const embed = new EmbedBuilder()
    .setAuthor({
      name: 'Rebalanceo Gastronómico',
      iconURL: 'https://media.discordapp.net/attachments/1032440236564824105/1513754769322414080/Picel.gif?ex=6a43e83d&is=6a4296bd&hm=2400706674437e00e7d3c1568db74b36023a1d2f0848416115937b2bf6a84f16&='
    })
    .setTitle('Menú Nutricional de Tezzlar')
    .setDescription('>>> La supervivencia requiere buena alimentación. Varias comidas clásicas han sido mejoradas drásticamente y se han introducido nuevos manjares con efectos únicos.\n\n**COMIDAS CLÁSICAS MEJORADAS 🍎**\n' + renderVanillaFoods(vanillaFoods) + '\n\n**PLATILLOS ESPECIALES ✨**\n' + renderCustomFoods(customFoods))
    .setColor(0xe67e22) // Orange color for food
    .setFooter({ text: 'Nota: Los efectos especiales aplican desde el Día 2, y los bufos de curación/saturación desde el Día 15.' });

  await interaction.reply({ embeds: [embed] });
};

import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { recipesData } from '../../utils/recipesData';

export const data = new SlashCommandBuilder()
  .setName('recipes')
  .setDescription('Muestra los crafteos y recetas especiales de Tezzlar')
  .addStringOption(option =>
    option.setName('id')
      .setDescription('ID de la receta o "list" para ver todas')
      .setRequired(true)
  );

export const metadata = {
  aliases: ['recetas', 'crafteos', 'crafts'],
  category: 'Minecraft',
  description: 'Muestra información e imágenes sobre las recetas y crafteos custom.',
  usage: 'recipes <list|id>',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const args = (interaction as any).args as string[] | undefined;
  
  let targetId = '';

  if (args) {
    if (args.length === 0) {
      return interaction.reply({ content: '❌ Uso correcto: `!recipes <list|id>`', ephemeral: true });
    }
    targetId = args[0].toLowerCase();
  } else {
    targetId = interaction.options.getString('id', true).toLowerCase();
  }

  if (targetId === 'list') {
    const embed = new EmbedBuilder()
      .setAuthor({
        name: 'Recetario de Tezzlar',
        iconURL: 'https://media.discordapp.net/attachments/1032440236564824105/1513754769322414080/Picel.gif?ex=6a43e83d&is=6a4296bd&hm=2400706674437e00e7d3c1568db74b36023a1d2f0848416115937b2bf6a84f16&='
      })
      .setTitle('Lista de Categorías de Crafteo')
      .setDescription('Estos son los diferentes tomos de crafteos y recetas modificadas. Usa `!recipes <id>` para ver los detalles y las imágenes guía de cada categoría.')
      .setColor(0x2b2d31);

    let listText = '';
    for (const key of Object.keys(recipesData)) {
      const recipe = recipesData[key];
      listText += `**➔ ${recipe.title}**\n⠀\\- \`ID:\` ${recipe.id}\n\n`;
    }

    embed.addFields([{ name: 'RECETAS DISPONIBLES 📚', value: listText.trim() }]);

    return interaction.reply({ embeds: [embed] });
  }

  const recipe = recipesData[targetId];

  if (!recipe) {
    return interaction.reply({ content: `❌ No se encontró ninguna receta con el ID \`${targetId}\`. Usa \`!recipes list\` para ver las disponibles.`, ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setAuthor({
      name: 'Recetario de Tezzlar',
      iconURL: 'https://media.discordapp.net/attachments/1032440236564824105/1513754769322414080/Picel.gif?ex=6a43e83d&is=6a4296bd&hm=2400706674437e00e7d3c1568db74b36023a1d2f0848416115937b2bf6a84f16&='
    })
    .setTitle(recipe.title)
    .setDescription(recipe.description)
    .setImage(recipe.imageUrl)
    .setColor(recipe.color);

  await interaction.reply({ embeds: [embed] });
};

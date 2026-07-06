import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('recipes')
  .setDescription('Muestra crafteos custom o cambios en la dificultad')
  .addStringOption(option =>
    option.setName('tipo')
      .setDescription('Tipo de recetas a ver')
      .setRequired(false)
      .addChoices(
        { name: 'Custom', value: 'custom' },
        { name: 'List', value: 'list' }
      )
  );

export const metadata = {
  aliases: ['recetas', 'crafteos'],
  category: 'Minecraft',
  description: 'Muestra crafteos custom o de rebalanceo.',
  usage: 'recipes [custom|list]',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const args = (interaction as any).args as string[] | undefined;
  
  let tipo = 'list';

  if (args) {
    if (args.length > 0) {
      tipo = args[0].toLowerCase();
    }
  } else {
    tipo = interaction.options.getString('tipo') || 'list';
  }

  if (tipo === 'list') {
    const embed = new EmbedBuilder()
      .setColor('#5A6ED6')
      .setAuthor({
        name: 'Sistema de Crafteos',
        iconURL: 'https://media.discordapp.net/attachments/1032440236564824105/1513754769322414080/Picel.gif?ex=6a4d22bd&is=6a4bd13d&hm=36f4fec6efd7abd778878d8413fc56fe2d56f344403ea856ed77edacee655ecf&'
      })
      .setTitle('Opciones de !recipes')
      .setDescription('Estos son los argumentos que puedes usar con este comando:\n\n`!recipes custom` - Muestra los items nuevos y crafteos custom.')
      .setThumbnail('https://media.discordapp.net/attachments/1032440236564824105/1519191750948819025/corazonestezzlar.png?ex=6a4d23d2&is=6a4bd252&hm=b66aa4129b4dc3d98dc4a9d126d7ab13087e5c13d029b536b7127de48a638c56&format=webp&quality=lossless&width=960&height=960&');
    return interaction.reply({ embeds: [embed] });
  }

  if (tipo === 'custom') {
    const textContent = `## 1. Zanahoria de Cobre\n*Con pepitas de cobre y una zanahoria, otorga mejor saciedad y saturación que una zanahoria común y al consumirla otorga Night Vision durante 60 segundos.*\n## 2. Tótems de Mob\n*Tótems con efectos especiales según el mob:*\n* 🦎 **Ajolote**: Regeneration\n* 🐟 **Pez**: Dolphin's Grace\n* 🟨 **Sulfur**: Night Vision\n* 🐸 **Renacuajo**: Jump Boost\n* 👻 **Happy Ghast**: Strength\n* 🤖 **Gólem de Cobre**: Resistance\n* 🐝 **Abeja**: Inyecta Poison al atacar\n* 🐔 **Gallina**: Speed\n* 🦖 **Sniffer**: Haste\n* 🐢 **Tortuga**: Weakness`;

    return interaction.reply({
      content: textContent,
      files: [
        'https://media.discordapp.net/attachments/1408520442960023592/1522303093767933993/image.png?ex=6a4d40bc&is=6a4bef3c&hm=a1370d5bc6662f91309b57c2af9089547967c7c4bdc8df838a5779cc71e5ed68&=&format=webp&quality=lossless',
        'https://media.discordapp.net/attachments/1408520442960023592/1523772114715410472/image.png?ex=6a4d52de&is=6a4c015e&hm=73b0edb20a22fe71fe8ccf3e24ea7da9a823b26cc98cfb59cda3cd32dc270858&=&format=webp&quality=lossless'
      ]
    });
  }

  if (tipo === 'rebalance') {
    const embed = new EmbedBuilder()
      .setColor('#E74C3C')
      .setTitle('Rebalance de Crafteos')
      .setDescription('Aquí se mostrarán los rebalances de crafteos (información pendiente).');
      
    return interaction.reply({ embeds: [embed] });
  }

  return interaction.reply({ content: '❌ Opción no válida. Usa `!recipes list` para ver las opciones disponibles.', ephemeral: true });
};

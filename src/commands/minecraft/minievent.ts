import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { minieventsData } from '../../utils/minieventsData';

export const data = new SlashCommandBuilder()
  .setName('minievent')
  .setDescription('Información sobre los minieventos de Tezzlar')
  .addStringOption(option =>
    option.setName('id')
      .setDescription('ID del minievento o "list" para ver todos')
      .setRequired(true)
  );

export const metadata = {
  aliases: ['minieventos', 'minievents', 'me'],
  category: 'Minecraft',
  description: 'Muestra información detallada sobre los minieventos aleatorios.',
  usage: 'minievent <list|id>',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const args = (interaction as any).args as string[] | undefined;
  
  let targetId = '';

  if (args) {
    if (args.length === 0) {
      return interaction.reply({ content: '❌ Uso correcto: `!minievent <list|id>`', ephemeral: true });
    }
    targetId = args[0].toLowerCase();
  } else {
    targetId = interaction.options.getString('id', true).toLowerCase();
  }

  if (targetId === 'list') {
    const embed = new EmbedBuilder()
      .setAuthor({
        name: 'Minieventos de Tezzlar',
        iconURL: 'https://media.discordapp.net/attachments/1032440236564824105/1513754769322414080/Picel.gif?ex=6a43e83d&is=6a4296bd&hm=2400706674437e00e7d3c1568db74b36023a1d2f0848416115937b2bf6a84f16&='
      })
      .setTitle('Lista de Minieventos Disponibles')
      .setDescription('Estos son todos los eventos aleatorios que pueden ocurrir repentinamente. Usa `!minievent <id>` para ver más detalles sobre uno en específico.')
      .setColor(0x2b2d31);

    let listText = '';
    for (const key of Object.keys(minieventsData)) {
      const event = minieventsData[key];
      listText += `**➔ ${event.name}**\n⠀\\- \`ID:\` ${event.id}\n\n`;
    }

    embed.addFields([{ name: 'EVENTOS 🎲', value: listText.trim() }]);

    return interaction.reply({ embeds: [embed] });
  }

  const eventData = minieventsData[targetId];

  if (!eventData) {
    return interaction.reply({ content: `❌ No se encontró ningún minievento con el ID \`${targetId}\`. Usa \`!minievent list\` para ver los disponibles.`, ephemeral: true });
  }

  const effectsList = eventData.effects.map(eff => `⠀\\\\- ${eff}`).join('\n');

  const embed = new EmbedBuilder()
    .setAuthor({
      name: 'Minievento Aleatorio',
      iconURL: 'https://media.discordapp.net/attachments/1032440236564824105/1513754769322414080/Picel.gif?ex=6a43e83d&is=6a4296bd&hm=2400706674437e00e7d3c1568db74b36023a1d2f0848416115937b2bf6a84f16&='
    })
    .setTitle(eventData.name)
    .setDescription(`*${eventData.description}*`)
    .setColor(eventData.color)
    .addFields([
      {
        name: 'DURACIÓN ⏱️',
        value: `>>> **➔ Tiempo activo:**\n${eventData.duration}`,
        inline: false
      },
      {
        name: 'EFECTOS ⚡',
        value: `>>> **➔ Consecuencias:**\n${effectsList}`,
        inline: false
      }
    ]);

  await interaction.reply({ embeds: [embed] });
};

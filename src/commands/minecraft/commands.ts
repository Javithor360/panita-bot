import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { comandosList } from '../../utils/comandosData';

export const data = new SlashCommandBuilder()
  .setName('commands')
  .setDescription('Muestra la lista de comandos útiles en el servidor de Minecraft');

export const metadata = {
  aliases: ['comandos', 'cmds'],
  category: 'Minecraft',
  description: 'Muestra una lista interactiva de los comandos disponibles dentro del servidor.',
  usage: 'comandos',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction | any) => {
  const embed = new EmbedBuilder()
    .setTitle('📌 Comandos Útiles del Servidor')
    .setColor(0x00bfff)
    .setThumbnail('https://media.discordapp.net/attachments/1032440236564824105/1519191750948819025/corazonestezzlar.png?ex=6a43e952&is=6a4297d2&hm=aa4cabc21f3ea3d19283a2e0dadb950a762861b92f6bf42879d75a75640225c7&=&format=webp&quality=lossless&width=960&height=960');
  
  if (comandosList.length === 0) {
    embed.setDescription('Aún no hay comandos registrados en la base de datos.');
  } else {
    // Generate the description string by mapping the list
    const descriptionText = comandosList
      .map(c => `→ \`${c.comando}\` - ${c.descripcion}`)
      .join('\n\n');
      
    embed.setDescription(descriptionText);
  }

  if (interaction.message) {
    await interaction.channel.send({ embeds: [embed] });
  } else {
    await interaction.reply({ embeds: [embed] });
  }
};

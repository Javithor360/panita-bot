import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('uptime')
  .setDescription('Muestra el tiempo continuo que el bot lleva en línea.');

export const metadata = {
  aliases: ['tiempo', 'online'],
  category: 'Utilidad',
  description: 'Muestra el tiempo continuo que el bot lleva en línea.',
  usage: 'uptime',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const client = interaction.client;
  
  // client.uptime contains the time in milliseconds since the bot connected
  const uptimeMs = client.uptime || 0;
  
  // Calculate days, hours, minutes and seconds
  let totalSeconds = Math.floor(uptimeMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  totalSeconds %= 86400;
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds %= 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  // Timestamp of when the bot started, to use Discord's native relative format
  const readyTimestamp = Math.floor((Date.now() - uptimeMs) / 1000);

  const embed = new EmbedBuilder()
    .setColor('#00a8ff') // Vibrant blue
    .setTitle('⏱️ Tiempo de Actividad')
    .addFields(
      { name: 'Tiempo continuo', value: `\`${parts.join(' ')}\``, inline: true },
      { name: 'Iniciado desde', value: `<t:${readyTimestamp}:R>`, inline: true }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
};

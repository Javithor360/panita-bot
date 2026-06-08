import { ChatInputCommandInteraction, SlashCommandBuilder, Message } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Muestra la latencia del bot.');

export const metadata = {
  aliases: ['latencia'],
  category: 'Utilidad',
  description: 'Calcula la latencia y el tiempo de respuesta del bot.',
  usage: 'ping',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await interaction.reply({ content: 'Calculando...' });
  const reply = await interaction.fetchReply();
  const ping = reply.createdTimestamp - interaction.createdTimestamp;
  await interaction.editReply({ content: `Pong! Latencia: \`${ping}ms\`` });
};

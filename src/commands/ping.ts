import { ChatInputCommandInteraction, SlashCommandBuilder, Message } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Muestra la latencia del bot.');

export const metadata = {
  aliases: ['latencia'],
  category: 'General',
  description: 'Calcula la latencia y el tiempo de respuesta del bot.',
  usage: 'ping',
  slashOnly: false,
  devOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await interaction.reply({ content: 'Calculando...' });
  const reply = await interaction.fetchReply();
  const latency = reply.createdTimestamp - interaction.createdTimestamp;
  await interaction.editReply(`¡Pong! Latencia: ${latency}ms`);
};

export const executeText = async (message: Message, args: string[]) => {
  const sent = await message.reply('Calculando...');
  const latency = sent.createdTimestamp - message.createdTimestamp;
  await sent.edit(`¡Pong! Latencia: ${latency}ms`);
};

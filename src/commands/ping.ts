import { ChatInputCommandInteraction, SlashCommandBuilder, Message } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Replies with Pong!');

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await interaction.reply({ content: 'Pinging...' });
  const reply = await interaction.fetchReply();
  const latency = reply.createdTimestamp - interaction.createdTimestamp;
  await interaction.editReply(`Pong! Latency: ${latency}ms`);
};

export const executeText = async (message: Message, args: string[]) => {
  const sent = await message.reply('Pinging...');
  const latency = sent.createdTimestamp - message.createdTimestamp;
  await sent.edit(`Pong! Latency: ${latency}ms`);
};

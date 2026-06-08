import { ChatInputCommandInteraction, SlashCommandBuilder, Message } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ip')
  .setDescription('Muestra la dirección IP del servidor de Minecraft.');

export const metadata = {
  aliases: ['server', 'jugar'],
  category: 'General',
  description: 'Proporciona la IP y estado actual del servidor de Minecraft.',
  usage: 'ip',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await interaction.reply({
    content: '<:noautorizo:1116806520265506866> **Por el momento no hay servidor de Minecraft vigente.**'
  });
};

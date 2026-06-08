import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ip')
  .setDescription('Muestra la dirección IP del servidor de Minecraft.');

export const metadata = {
  aliases: ['server', 'jugar'],
  category: 'Utilidad',
  description: 'Proporciona la IP y estado actual del servidor de Minecraft.',
  usage: 'ip',
  slashOnly: false,
  devOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await interaction.reply({
    content: '<:noautorizo:1513404854939156521> **Por el momento no hay servidor de Minecraft vigente.** ¡Mantente atento a los anuncios!'
  });
};

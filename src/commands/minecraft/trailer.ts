import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('trailer')
  .setDescription('Muestra el enlace del tráiler de Tezzlar 3.');

export const metadata = {
  aliases: [],
  category: 'Minecraft',
  description: 'Comparte el enlace del tráiler de Tezzlar 3.',
  usage: 'trailer',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await interaction.reply({
    content: '<a:tezzlar3:1513802514884067409> Puedes ver el tráiler de Tezzlar 3 aquí: https://youtu.be/DgSIYtxt_jEZ'
  });
};

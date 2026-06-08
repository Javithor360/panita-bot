import { ChatInputCommandInteraction, SlashCommandBuilder, Message } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('web')
  .setDescription('Muestra el enlace para acceder al Panel Web.');

export const metadata = {
  aliases: ['pagina', 'panel'],
  category: 'Utilidad',
  description: 'Comparte el enlace directo al Panel Web del servidor.',
  usage: 'web',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await interaction.reply({
    content: 'Visita nuestro sitio web oficial: <https://panita.vercel.app>'
  });
};

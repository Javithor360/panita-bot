import { ChatInputCommandInteraction, SlashCommandBuilder, Message } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('donate')
  .setDescription('Muestra el enlace para apoyar el servidor con donaciones.');

export const metadata = {
  aliases: ['donar', 'donacion', 'donaciones', 'fund'],
  category: 'General',
  description: 'Comparte el enlace de PayPal para donaciones.',
  usage: 'donate',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await interaction.reply({
    content: 'Para apoyar el servidor, puedes donar a través de nuestro PayPal: <https://www.paypal.me/Javithor360>'
  });
};

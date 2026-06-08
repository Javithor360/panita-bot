import { ChatInputCommandInteraction, SlashCommandBuilder, Message } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('invite')
  .setDescription('Muestra el enlace de invitación al servidor de Discord.');

export const metadata = {
  aliases: ['invitacion', 'discord'],
  category: 'Utilidad',
  description: 'Comparte el enlace oficial de invitación al servidor de Discord para que puedas invitar a tus amigos.',
  usage: 'invite',
  slashOnly: false,
  devOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await interaction.reply({
    content: '✉️ Comparte este enlace para invitar a tus amigos al servidor de Discord: https://discord.gg/m9zFH8yqUu'
  });
};

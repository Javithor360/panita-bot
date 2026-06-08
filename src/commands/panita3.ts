import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('panita3')
  .setDescription('Te revela la fecha de salida para Panita 3...');

export const metadata = {
  aliases: [],
  category: 'Diversión',
  description: 'Te revela la fecha de salida para Panita 3.',
  usage: 'panita3',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  // Generate a random number of days (e.g. between 1 and 1000 days)
  const randomDays = Math.floor(Math.random() * 1000) + 1;
  
  // Calculate future date
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + randomDays);
  
  // Get Unix timestamp in seconds (Discord uses seconds, not milliseconds)
  const unixTimestamp = Math.floor(futureDate.getTime() / 1000);
  
  // The format <t:TIMESTAMP:R> is Discord's relative time format (e.g. "in 24 days")
  await interaction.reply({
    content: `Panitacraft 3 será lanzado oficialmente **<t:${unixTimestamp}:R>**... <:jaimePog:723406415917613056>`
  });
};

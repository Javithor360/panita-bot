import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('announcements')
  .setDescription('Un recordatorio "amistoso" para leer los anuncios.');

export const metadata = {
  aliases: [],
  category: 'Diversión',
  description: 'Manda a leer el canal de anuncios con dialecto chileno.',
  usage: 'announcements',
  slashOnly: false,
  devOnly: false,
  staffOnly: false
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  // Array of Chilean insults to randomly select from
  const insults = [
    'Oye sapo conchetumare, ¿por qué no leís los anuncios primero?',
    'A ver si leís los anuncios, aweonao ql.',
    'Puta el weón porfiao, andá a leer los anuncios culiao.',
    'Leé los anuncios saco wea, no seay pajero.',
    'Pajaron ql, date la paja de leer los anuncios.',
    'Oye tonto weón, en los anuncios está toda la info. ¡Lee po!'
  ];

  // Pick a random insult from the array
  const randomInsult = insults[Math.floor(Math.random() * insults.length)];
  
  // Reply to the user with the randomly selected insult
  await interaction.reply({
    content: `📢 ${randomInsult}`
  });
};

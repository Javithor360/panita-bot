import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';

const INSULTS = [
  'Oye sapo conchetumare, ¿por qué no leís los anuncios primero?',
  'A ver si leís los anuncios, aweonao ql.',
  'Puta el weón porfiao, andá a leer los anuncios culiao.',
  'Leé los anuncios saco wea, no seay pajero.',
  'Pajaron ql, date la paja de leer los anuncios.',
  'Oye tonto weón, en los anuncios está toda la info. ¡Lee po!',
];

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('announcements')
    .setDescription('Un recordatorio "amistoso" para leer los anuncios.'),
  meta: {
    category: CATEGORIES.fun,
    description: 'Manda a leer el canal de anuncios con dialecto chileno.',
    aliases: ['anuncios'],
  },
  async run(ctx) {
    const insult = INSULTS[Math.floor(Math.random() * INSULTS.length)];
    await ctx.reply(`📢 ${insult}`);
  },
});

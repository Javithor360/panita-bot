import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { fromGalactic } from '../../lib/galactic';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('disenchant')
    .setDescription('Traduce un texto del Standard Galactic Alphabet al español.')
    .addStringOption(option =>
      option.setName('texto')
        .setDescription('El texto a desencantar')
        .setRequired(true),
    ),
  meta: {
    category: CATEGORIES.fun,
    description: 'Traduce un texto del Standard Galactic Alphabet al español.',
    aliases: ['desencantar'],
  },
  async run(ctx) {
    await ctx.reply(fromGalactic(ctx.options.getString('texto', true)));
  },
});

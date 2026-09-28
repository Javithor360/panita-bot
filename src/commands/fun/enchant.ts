import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { toGalactic } from '../../lib/galactic';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('enchant')
    .setDescription('Traduce tu texto al Standard Galactic Alphabet (Mesa de encantamientos).')
    .addStringOption(option =>
      option.setName('texto')
        .setDescription('El texto a encantar')
        .setRequired(true),
    ),
  meta: {
    category: CATEGORIES.fun,
    description: 'Traduce tu texto al Standard Galactic Alphabet.',
    aliases: ['encantar'],
  },
  async run(ctx) {
    await ctx.reply(toGalactic(ctx.options.getString('texto', true)));
  },
});

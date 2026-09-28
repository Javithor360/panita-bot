import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, EMOJIS, URLS } from '../../config/constants';
import { defineCommand } from '../../core/command';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('trailer')
    .setDescription('Muestra el enlace del tráiler de Tezzlar 3.'),
  meta: {
    category: CATEGORIES.minecraft,
    description: 'Comparte el enlace del tráiler de Tezzlar 3.',
  },
  async run(ctx) {
    await ctx.reply(`${EMOJIS.tezzlar3} Puedes ver el tráiler de Tezzlar 3 aquí: ${URLS.trailer}`);
  },
});

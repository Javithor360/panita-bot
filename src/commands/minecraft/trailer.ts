import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, EMOJIS, URLS } from '../../config/constants';
import { defineCommand } from '../../core/command';

/** The trailer of Enriquecraft 666. The one of Tezzlar 3 is `tezzlar trailer`. */
export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('trailer')
    .setDescription('Muestra el enlace del tráiler de Enriquecraft 666.'),
  meta: {
    category: CATEGORIES.minecraft,
    description: 'Comparte el enlace del tráiler de Enriquecraft 666. El de Tezzlar 3 está en `tezzlar trailer`.',
  },
  async run(ctx) {
    await ctx.reply(`${EMOJIS.llamushroom} Puedes ver el tráiler de Enriquecraft 666 aquí: ${URLS.enriquecraftTrailer}`);
  },
});

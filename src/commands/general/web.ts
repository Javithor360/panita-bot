import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, URLS } from '../../config/constants';
import { defineCommand } from '../../core/command';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('web')
    .setDescription('Muestra el enlace para acceder al Panel Web.'),
  meta: {
    category: CATEGORIES.general,
    description: 'Comparte el enlace directo al Panel Web del servidor.',
    aliases: ['pagina', 'panel'],
  },
  async run(ctx) {
    await ctx.reply(`Visita nuestro sitio web oficial: <${URLS.web}>`);
  },
});

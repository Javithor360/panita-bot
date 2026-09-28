import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, EMOJIS } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { discordTimestamp } from '../../lib/format';

const DAY_MS = 24 * 60 * 60 * 1000;

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('panita3')
    .setDescription('Te revela la fecha de salida para Panita 3...'),
  meta: {
    category: CATEGORIES.fun,
    description: 'Te revela la fecha de salida para Panita 3.',
  },
  async run(ctx) {
    // A random "release date" between 1 and 1000 days from now
    const randomDays = Math.floor(Math.random() * 1000) + 1;
    const releaseDate = Date.now() + randomDays * DAY_MS;
    await ctx.reply(`Panitacraft 3 será lanzado oficialmente el **${discordTimestamp(releaseDate, 'F')}**... ${EMOJIS.jaimePog}`);
  },
});

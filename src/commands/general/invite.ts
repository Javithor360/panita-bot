import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES, URLS } from '../../config/constants';
import { defineCommand } from '../../core/command';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Muestra el enlace de invitación al servidor de Discord.'),
  meta: {
    category: CATEGORIES.general,
    description: 'Comparte el enlace oficial de invitación al servidor de Discord para que puedas invitar a tus amigos.',
    aliases: ['invitacion', 'discord'],
  },
  async run(ctx) {
    await ctx.reply(`✉️ Comparte este enlace para invitar a tus amigos al servidor de Discord: ${URLS.discordInvite}`);
  },
});

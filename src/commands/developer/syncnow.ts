import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { pollPasswordResetsNow } from '../../services/passwordResetSync';
import { pollWebSyncNow } from '../../services/webSync';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('syncnow')
    .setDescription('Consulta ahora a la API los cambios de la web y los reinicios de contraseña pendientes'),
  meta: {
    category: CATEGORIES.developer,
    description: 'Adelanta la consulta periódica a la API: aplica los cambios de roles hechos en la web y entrega los reinicios pendientes. También renueva el latido del bot.',
    access: 'developer',
    slashOnly: true,
  },
  async run(ctx) {
    await ctx.defer({ ephemeral: true });

    const [web, resets] = await Promise.all([pollWebSyncNow(), pollPasswordResetsNow()]);
    const status = (ran: boolean) => (ran ? '✅' : '⚠️ no está activo');

    await ctx.reply(`Consulta hecha.\n• Cambios de la web: ${status(web)}\n• Reinicios de contraseña: ${status(resets)}`);
  },
});

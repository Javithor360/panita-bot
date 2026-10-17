import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { UserError } from '../../core/errors';
import { syncAvatars } from '../../services/memberSync';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('avatarsync')
    .setDescription('Fuerza la sincronización de los avatares de Discord con la base de datos')
    .addUserOption(o => o.setName('usuario').setDescription('Solo este miembro (por defecto, todos)')),
  meta: {
    category: CATEGORIES.developer,
    description: 'Guarda el avatar actual de Discord (el del servidor si lo tienen) de todos los miembros con cuenta, o solo de uno. No crea cuentas ni toca otros datos.',
    access: 'developer',
    slashOnly: true,
  },
  async run(ctx) {
    await ctx.defer({ ephemeral: true });

    const target = ctx.options.getUser('usuario');
    let members;
    if (target) {
      const member = await ctx.guild.members.fetch(target.id).catch(() => null);
      if (!member) throw new UserError('Ese usuario no está en el servidor.');
      members = [member];
    } else {
      console.log('[AvatarSync] Fetching all guild members...');
      members = [...(await ctx.guild.members.fetch()).values()];
    }

    const summary = await syncAvatars(members);
    console.log(`[AvatarSync] Done: ${JSON.stringify(summary)}`);

    const failed = summary.failed > 0 ? `\n⚠️ **${summary.failed}** fallaron; revisa los registros.` : '';
    await ctx.reply(
      `✅ Avatares sincronizados: **${summary.updated}** actualizados, ${summary.unchanged} sin cambios o sin cuenta, ` +
      `${summary.skipped} bots/multicuentas omitidos.${failed}`,
    );
  },
});

import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { setGlobalSyncLock } from '../../lib/syncLock';
import { resyncMembers } from '../../services/memberSync';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('systemsync')
    .setDescription('Sincroniza la base de datos con los miembros y roles actuales del servidor'),
  meta: {
    category: CATEGORIES.developer,
    description: 'Crea las cuentas faltantes y actualiza perfiles, roles y ediciones según el servidor. No elimina datos.',
    access: 'developer',
    slashOnly: true,
  },
  async run(ctx) {
    await ctx.defer({ ephemeral: true });

    setGlobalSyncLock(true);
    try {
      console.log('[SystemSync] Fetching all guild members...');
      const members = await ctx.guild.members.fetch();
      const summary = await resyncMembers([...members.values()]);
      console.log(`[SystemSync] Done: ${JSON.stringify(summary)}`);

      await ctx.reply(
        `✅ Sincronización completa. Se procesaron **${summary.processed}** usuarios ` +
        `(**${summary.created}** cuentas nuevas, ${summary.skipped} bots/multicuentas omitidos).`,
      );
    } finally {
      setGlobalSyncLock(false);
    }
  },
});

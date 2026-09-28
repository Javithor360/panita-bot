import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { isAltAccount } from '../../lib/discord';
import { deleteUsersByDiscordIds } from '../../services/users';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('cleanalts')
    .setDescription('Elimina de la base de datos las cuentas secundarias'),
  meta: {
    category: CATEGORIES.developer,
    description: 'Elimina de la base de datos las cuentas secundarias (multicuentas).',
    access: 'developer',
    slashOnly: true,
  },
  async run(ctx) {
    await ctx.defer({ ephemeral: true });

    const members = await ctx.guild.members.fetch();
    const altIds = members.filter(isAltAccount).map(member => member.id);
    if (altIds.length === 0) return ctx.reply('No se encontraron cuentas secundarias en el servidor.');

    const deleted = await deleteUsersByDiscordIds(altIds);
    await ctx.reply(`✅ Se han eliminado **${deleted}** cuentas secundarias de la base de datos.`);
  },
});

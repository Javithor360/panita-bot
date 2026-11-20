import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { fail, ok } from '../../lib/voice';
import { requireTicketChannel } from '../../features/tickets/context';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remueve a un usuario del ticket actual')
    .addUserOption(opt => opt.setName('user').setDescription('Usuario a remover').setRequired(true)),
  meta: {
    category: CATEGORIES.tickets,
    description: 'Remueve a un usuario del ticket actual.',
    access: 'staff',
  },
  async run(ctx) {
    await ctx.defer();
    const { ticket, channel } = await requireTicketChannel(ctx);
    const user = ctx.options.getUser('user', true);

    if (user.id === ticket.creator_id) return ctx.reply(fail(ctx.member, 'No puedes remover al creador del ticket.'));
    if (!channel.permissionOverwrites.cache.get(user.id)?.allow.has('ViewChannel')) {
      return ctx.reply(fail(ctx.member, `El usuario <@${user.id}> no se encuentra en el ticket.`));
    }

    await channel.permissionOverwrites.delete(user.id);
    await ctx.reply(ok(ctx.member, `Se ha removido a <@${user.id}> de este ticket.`));
  },
});

import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { TICKET_MEMBER_OVERWRITE } from '../../features/tickets/permissions';
import { requireTicketChannel } from '../../features/tickets/context';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('add')
    .setDescription('Añade a un usuario al ticket actual')
    .addUserOption(opt => opt.setName('user').setDescription('Usuario a añadir').setRequired(true)),
  meta: {
    category: CATEGORIES.tickets,
    description: 'Añade a un usuario al ticket actual.',
    access: 'staff',
  },
  async run(ctx) {
    await ctx.defer();
    const { ticket, channel } = await requireTicketChannel(ctx);
    const user = ctx.options.getUser('user', true);

    if (user.id === ticket.creator_id) {
      return ctx.reply(`❌ El usuario <@${user.id}> es el creador del ticket y ya está en él.`);
    }
    if (channel.permissionOverwrites.cache.get(user.id)?.allow.has('ViewChannel')) {
      return ctx.reply(`❌ El usuario <@${user.id}> ya está en el ticket.`);
    }

    await channel.permissionOverwrites.create(user.id, TICKET_MEMBER_OVERWRITE);
    await ctx.reply(`✅ Se ha añadido a <@${user.id}> a este ticket.`);
  },
});

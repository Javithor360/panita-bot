import { SlashCommandBuilder } from 'discord.js';
import { CATEGORIES } from '../../config/constants';
import { defineCommand } from '../../core/command';
import { buildCloseConfirm } from '../../features/tickets/embeds';
import { findTicketByChannel, TICKET_STATUS } from '../../services/tickets';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Cierra forzosamente el ticket actual'),
  meta: {
    category: CATEGORIES.tickets,
    description: 'Cierra el ticket actual de forma segura (pide confirmación).',
    access: 'staff',
  },
  async run(ctx) {
    await ctx.defer();
    const ticket = ctx.channel ? await findTicketByChannel(ctx.channel.id) : null;
    if (!ticket) return ctx.reply('❌ Este canal no pertenece a un ticket.');
    if (ticket.status === TICKET_STATUS.closed) return ctx.reply('❌ Este ticket ya está cerrado.');

    await ctx.reply(buildCloseConfirm(ctx.user.id));
  },
});

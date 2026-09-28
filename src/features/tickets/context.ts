import { ChannelType } from 'discord.js';
import type { CommandContext } from '../../core/context';
import { UserError } from '../../core/errors';
import { findTicketByChannel } from '../../services/tickets';

/** The ticket for the channel the command runs in, or a user-facing error. */
export const requireTicketChannel = async (ctx: CommandContext) => {
  const channel = ctx.channel;
  const ticket = channel ? await findTicketByChannel(channel.id) : null;
  if (!ticket || channel?.type !== ChannelType.GuildText) {
    throw new UserError('❌ Este canal no pertenece a un ticket.');
  }
  return { ticket, channel };
};

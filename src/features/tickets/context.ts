import { ChannelType, type ButtonInteraction } from 'discord.js';
import type { CommandContext } from '../../core/context';
import { UserError } from '../../core/errors';
import { PRE_ACK_REQUEST } from '../../lib/api';
import { findTicketByChannel, type TicketWithPanel } from '../../services/tickets';

/** The ticket for the channel the command runs in, or a user-facing error. */
export const requireTicketChannel = async (ctx: CommandContext) => {
  const channel = ctx.channel;
  const ticket = channel ? await findTicketByChannel(channel.id) : null;
  if (!ticket || channel?.type !== ChannelType.GuildText) {
    throw new UserError('❌ Este canal no pertenece a un ticket.');
  }
  return { ticket, channel };
};

const lookups = new WeakMap<ButtonInteraction, Promise<TicketWithPanel | null>>();

/**
 * The ticket of the channel a button was pressed in. A guard and its handler both need it, so the
 * lookup is made once per interaction. It runs before the interaction is acknowledged, hence a
 * single short attempt.
 */
export const ticketOfInteraction = (interaction: ButtonInteraction): Promise<TicketWithPanel | null> => {
  let lookup = lookups.get(interaction);
  if (!lookup) {
    lookup = findTicketByChannel(interaction.channelId, PRE_ACK_REQUEST);
    lookups.set(interaction, lookup);
  }
  return lookup;
};

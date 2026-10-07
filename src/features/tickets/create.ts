import { ApiError } from '../../lib/api';
import {
  PanelNotFoundError,
  TicketAlreadyOpenError,
  TicketChannelTakenError,
  type Ticket,
  type TicketPanel,
  type TicketWithPanel,
} from '../../services/tickets';

/** What the flow needs from the outside: the ticket service and the Discord channel operations. */
export interface CreateTicketDeps {
  findOpenTicketByCreator(creatorId: string, guildId: string): Promise<Ticket | null>;
  getPanel(panelId: string): Promise<TicketPanel | null>;
  nextTicketNumber(panelId: string): Promise<TicketPanel | null>;
  createTicket(ticket: { channelId: string; panelId: string; creatorId: string }): Promise<Ticket>;
  findTicketByChannel(channelId: string): Promise<TicketWithPanel | null>;
  /** Creates the ticket channel; `panel.ticket_counter` is the number to use. */
  createChannel(panel: TicketPanel): Promise<{ id: string }>;
  deleteChannel(channelId: string): Promise<unknown>;
}

export type CreateTicketResult =
  | { status: 'created'; channelId: string; panel: TicketPanel }
  | { status: 'already_open'; channelId: string | undefined }
  | { status: 'panel_not_found' };

/** Whether a failed `POST /v1/tickets` may still have been recorded (no definite answer from the API). */
const outcomeUnknown = (error: unknown) => error instanceof ApiError && (error.status === 0 || error.status >= 500);

/**
 * Creates a ticket: the channel is created first and recorded second. The API accepts exactly one open
 * ticket per user and guild, so when recording fails the channel just created is removed, whatever the
 * reason, and no channel is left without a ticket. Unexpected failures are removed and rethrown.
 */
export const createTicketFlow = async (
  input: { panelId: string; guildId: string; creatorId: string },
  deps: CreateTicketDeps,
): Promise<CreateTicketResult> => {
  const existing = await deps.findOpenTicketByCreator(input.creatorId, input.guildId);
  if (existing) return { status: 'already_open', channelId: existing.channel_id };

  const found = await deps.getPanel(input.panelId);
  if (!found) return { status: 'panel_not_found' };

  // The counter moves even if the rest fails; a skipped number is accepted
  const panel = await deps.nextTicketNumber(found.id);
  if (!panel) return { status: 'panel_not_found' };

  const channel = await deps.createChannel(panel);

  const removeChannel = () =>
    deps.deleteChannel(channel.id).catch(error => console.error('[Tickets] Could not remove the unused ticket channel:', error));

  try {
    await deps.createTicket({ channelId: channel.id, panelId: panel.id, creatorId: input.creatorId });
    return { status: 'created', channelId: channel.id, panel };
  } catch (error) {
    // A timeout or a 5xx does not say whether the ticket was recorded; deleting its channel would leave a
    // record that blocks the creator, so ask the API first.
    if (outcomeUnknown(error)) {
      const recorded = await deps.findTicketByChannel(channel.id).catch(() => null);
      if (recorded) return { status: 'created', channelId: channel.id, panel };
    }

    await removeChannel();
    if (error instanceof TicketAlreadyOpenError) return { status: 'already_open', channelId: error.channelId };
    if (error instanceof PanelNotFoundError) return { status: 'panel_not_found' };
    if (error instanceof TicketChannelTakenError) console.error('[Tickets] A new channel was already recorded as a ticket:', channel.id);
    throw error;
  }
};
